import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Keypair, Account, Asset, TransactionBuilder, Operation, Memo, Networks } from '@stellar/stellar-sdk';
import { hostedAction } from '../hosted.mjs';
import handler from '../api/demo.mjs';
import { randomUUID } from 'node:crypto';

async function fixture() {
  const record = await hostedAction({ action: 'quote', input: { supplier: 'Hosted Supplier', country: 'PT', amount: '100', requestId: randomUUID() } });
  const a = Keypair.random(), b = Keypair.random();
  const tx = new TransactionBuilder(new Account(a.publicKey(), '1'), { fee: '1000', networkPassphrase: Networks.TESTNET })
    .addOperation(Operation.payment({ destination: b.publicKey(), asset: new Asset('CHUSD', a.publicKey()), amount: record.assetAmount }))
    .addMemo(Memo.text(record.memo)).setTimebounds(0, record.expiresAt).build();
  tx.sign(a);
  return { record, xdr: tx.toXDR() };
}
test('hosted prepare rebuilds quote and ignores forged browser state', async () => {
  const { record, xdr } = await fixture();
  Object.assign(record, { rate: '999', status: 'reconciled', feePence: 0, journal: [{ account: 'forged' }], hash: 'forged' });
  const result = await hostedAction({ action: 'prepare', record, xdr });
  assert.equal(result.status, 'prepared'); assert.equal(result.rate, '1.28'); assert.equal(result.feePence, 50);
  assert.equal(result.assetAmount, '128.0000000'); assert.deepEqual(result.journal, []); assert.notEqual(result.hash, 'forged');
});
test('hosted confirmation requires chain evidence even for client-claimed reconciliation', async () => {
  const { record, xdr } = await fixture();
  record.xdr = xdr; record.status = 'reconciled'; record.journal = [{ account: 'forged' }];
  const fetcher = async url => url.endsWith('/') ? Response.json({ network_passphrase: Networks.TESTNET }) : new Response('', { status: 404 });
  const result = await hostedAction({ action: 'confirm', record }, fetcher);
  assert.equal(result.status, 'prepared'); assert.deepEqual(result.journal, []);
});
test('hosted verification rejects tampered invoice principal and ID', async () => {
  const { record, xdr } = await fixture();
  await assert.rejects(hostedAction({ action: 'prepare', record: { ...record, pence: 20000 }, xdr }));
  await assert.rejects(hostedAction({ action: 'prepare', record: { ...record, id: randomUUID() }, xdr }));
});
test('Vercel endpoint rejects cross-origin writes', async () => {
  let status, body;
  const res = { setHeader() {}, status(value) { status = value; return this; }, json(value) { body = value; return this; } };
  await handler({ method: 'POST', headers: { host: 'cherry-stellar.vercel.app', origin: 'https://other.example', 'content-type': 'application/json' }, body: {} }, res);
  assert.equal(status, 400); assert.match(body.error, /Same-origin/);
});
