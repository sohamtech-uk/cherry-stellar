// Opt-in live test: uses only free testnet funds and generates disposable keys.
import { Keypair, Account, Asset, TransactionBuilder, Operation, Memo } from '@stellar/stellar-sdk';
import { invoice, prepare, reconcile, horizon, HORIZON, NETWORK } from '../domain.mjs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
if (!process.argv.includes('--testnet')) throw new Error('Pass --testnet to send a free test payment.');
const sender = Keypair.random(), recipient = Keypair.random();
for (const key of [sender, recipient]) {
  console.log('Funding disposable test account…');
  const response = await fetch(`https://friendbot.stellar.org?addr=${key.publicKey()}`, { signal: AbortSignal.timeout(60000) });
  assert(response.ok, `Friendbot returned ${response.status}`);
}
async function submit(tx) {
  const response = await fetch(HORIZON + '/transactions', { method: 'POST', body: new URLSearchParams({ tx: tx.toXDR() }), signal: AbortSignal.timeout(60000) });
  assert(response.ok, `Horizon returned ${response.status}: ${await response.text()}`);
}
const asset = new Asset('CHUSD', sender.publicKey());
const account = await horizon(`/accounts/${recipient.publicKey()}`);
const trust = new TransactionBuilder(new Account(account.account_id, account.sequence), { fee: '1000', networkPassphrase: NETWORK })
  .addOperation(Operation.changeTrust({ asset, limit: '100000' })).setTimeout(180).build();
trust.sign(recipient); await submit(trust);
const r = invoice({ supplier: 'Testnet smoke supplier', country: 'PT', amount: '1', requestId: randomUUID() });
const source = await horizon(`/accounts/${sender.publicKey()}`);
const payment = new TransactionBuilder(new Account(source.account_id, source.sequence), { fee: '1000', networkPassphrase: NETWORK })
  .addOperation(Operation.payment({ destination: recipient.publicKey(), asset, amount: r.assetAmount }))
  .addMemo(Memo.text(r.memo)).setTimebounds(0, r.expiresAt).build();
payment.sign(sender); prepare(r, payment.toXDR(), []);
console.log(`Prepared testnet hash: ${r.hash}`);
await submit(payment);
for (let i = 0; i < 5 && r.status === 'prepared'; i++) {
  await reconcile(r);
  if (r.status === 'prepared') await new Promise(resolve => setTimeout(resolve, 2000));
}
assert.equal(r.status, 'reconciled');
assert.equal(r.journal.length, 10);
console.log(JSON.stringify({ status: r.status, hash: r.hash, ledger: r.ledger, asset: 'CHUSD', amount: r.assetAmount, networkFeeStroops: r.networkFeeStroops, journalEntries: r.journal.length, explorer: `https://stellar.expert/explorer/testnet/tx/${r.hash}` }, null, 2));
