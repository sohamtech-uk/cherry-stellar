import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, Asset, Account, TransactionBuilder, Operation, Memo, Networks } from '@stellar/stellar-sdk';
import { invoice, prepare, reconcile, NETWORK } from '../domain.mjs';

const now = 1788948000000;
function fixture(change = {}) {
  const record = invoice({ supplier: 'Lisbon Design Studio', country: 'PT', amount: '100', requestId: '12345678-1234-1234-1234-123456789abc' }, now);
  const sender = Keypair.random(), recipient = Keypair.random();
  const tx = new TransactionBuilder(new Account(sender.publicKey(), '1'), { fee: '1000', networkPassphrase: change.network || NETWORK })
    .addOperation(Operation.payment({ destination: recipient.publicKey(), asset: new Asset('CHUSD', sender.publicKey()), amount: change.amount || record.assetAmount }))
    .addMemo(Memo.text(change.memo || record.memo)).setTimebounds(0, record.expiresAt).build();
  tx.sign(sender);
  return { record, xdr: tx.toXDR() };
}
function evidence(record, change = {}) {
  const transaction = { hash: record.hash, source_account: record.issuer, successful: true, operation_count: 1, memo_type: 'text', memo: record.memo, created_at: new Date(now + 10000).toISOString(), fee_charged: '100', ledger: 12, ...change.tx };
  const operation = { type: 'payment', from: record.issuer, to: record.recipient, asset_code: 'CHUSD', asset_issuer: record.issuer, amount: record.assetAmount, ...change.op };
  return async url => {
    if (url.endsWith('/')) return Response.json({ network_passphrase: change.network || NETWORK });
    if (url.includes('/operations')) return Response.json({ _embedded: { records: [operation] } });
    if (change.status) return new Response('', { status: change.status });
    return Response.json(transaction);
  };
}
test('quote adds a separate fee and ignores client quote fields', () => {
  const r = invoice({ supplier: 'Vendor', country: 'IN', amount: '100.01', rate: '99', feePence: 0, requestId: '12345678-1234-1234-1234-123456789abc' }, now);
  assert.equal(r.assetAmount, '128.0128000'); assert.equal(r.fundingPence, 10051); assert.equal(r.feePence, 50);
});
test('rejects invalid monetary inputs', () => {
  for (const amount of ['0.99', '-1', '10000.01', 'NaN', '1e3', '1.001', '']) {
    assert.throws(() => invoice({ supplier: 'Vendor', country: 'IN', amount }, now));
  }
});
test('prepares and reuses only the exact signed transaction', () => {
  const { record, xdr } = fixture();
  prepare(record, xdr, [record], now);
  assert.equal(record.status, 'prepared'); assert.match(record.hash, /^[a-f0-9]{64}$/);
  prepare(record, xdr, [record], now + 9999999);
  assert.throws(() => prepare(record, fixture().xdr, [record], now));
});
for (const [name, changes] of [['mainnet', { network: Networks.PUBLIC }], ['wrong amount', { amount: '3' }], ['wrong memo', { memo: 'other' }]]) {
  test(`rejects ${name} envelope`, () => {
    const { record, xdr } = fixture(changes);
    assert.throws(() => prepare(record, xdr, [record], now));
  });
}
test('rejects expired quote and reused hash', () => {
  const { record, xdr } = fixture();
  assert.throws(() => prepare(record, xdr, [], now + 900001));
  prepare(record, xdr, [], now);
  const other = { ...record, id: 'different', status: 'quoted' };
  assert.throws(() => prepare(other, xdr, [record], now));
});
test('verified settlement balances each currency and reconciles only once', async () => {
  const { record, xdr } = fixture(); prepare(record, xdr, [], now);
  await reconcile(record, evidence(record));
  assert.equal(record.status, 'reconciled');
  for (const unit of ['GBP pence', 'XLM stroops']) assert.equal(record.journal.filter(r => r.unit === unit).reduce((sum, r) => sum + r.debit - r.credit, 0), 0);
  assert.equal(record.journal.length, 10);
  await reconcile(record, () => { throw new Error('Should not contact network again'); });
  assert.equal(record.journal.length, 10);
});
test('404 and service outage remain unresolved without journal entries', async () => {
  const { record, xdr } = fixture(); prepare(record, xdr, [], now);
  await reconcile(record, evidence(record, { status: 404 }));
  assert.equal(record.status, 'prepared');
  await assert.rejects(reconcile(record, evidence(record, { status: 503 })));
  assert.equal(record.status, 'prepared'); assert.deepEqual(record.journal, []);
});
test('on-chain failure never posts a journal', async () => {
  const { record, xdr } = fixture(); prepare(record, xdr, [], now);
  await reconcile(record, evidence(record, { tx: { successful: false } }));
  assert.equal(record.status, 'failed'); assert.deepEqual(record.journal, []);
});
for (const [name, change] of [
  ['network', { network: Networks.PUBLIC }], ['hash', { tx: { hash: 'bad' } }],
  ['memo', { tx: { memo: 'other' } }], ['operation count', { tx: { operation_count: 2 } }],
  ['late settlement', { tx: { created_at: new Date(now + 901000).toISOString() } }],
  ['amount', { op: { amount: '129.0000000' } }], ['recipient', { op: { to: Keypair.random().publicKey() } }],
  ['issuer', { op: { asset_issuer: Keypair.random().publicKey() } }], ['asset', { op: { asset_code: 'USDC' } }],
]) test(`rejects incorrect ${name} evidence`, async () => {
  const { record, xdr } = fixture(); prepare(record, xdr, [], now);
  await assert.rejects(reconcile(record, evidence(record, change)));
  assert.equal(record.status, 'prepared'); assert.deepEqual(record.journal, []);
});
