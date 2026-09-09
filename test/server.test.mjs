import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { Account, Asset, Keypair, Memo, Networks, Operation, TransactionBuilder } from '@stellar/stellar-sdk';

test('HTTP demo persists a signed payment across restart and rejects cross-origin writes', async () => {
  const data = await mkdtemp(join(tmpdir(), 'cherry-stellar-'));
  const port = 43191, origin = `http://127.0.0.1:${port}`;
  let child;
  async function start() {
    child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
    await Promise.race([once(child.stdout, 'data'), once(child, 'exit').then(() => { throw new Error('Server exited before ready'); }), new Promise((_, reject) => { const timeout = setTimeout(() => reject(new Error('Server start timeout')), 5000); timeout.unref(); })]);
  }
  async function stop() { const exited = once(child, 'exit'); child.kill('SIGTERM'); await exited; child = null; }
  const post = (path, body, requestOrigin = origin) => fetch(origin + path, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: requestOrigin }, body: JSON.stringify(body) });
  try {
    await start();
    const page = await fetch(origin); assert.equal(page.status, 200); assert.match(await page.text(), /Payment workspace/);
    assert.equal((await fetch(origin + '/stellar-sdk.js')).status, 200);
    const input = { supplier: 'Test Supplier', country: 'PT', amount: '100', requestId: randomUUID() };
    assert.equal((await post('/api/invoices', input, 'https://untrusted.example')).status, 400);
    const first = await post('/api/invoices', input); assert.equal(first.status, 200);
    const record = await first.json();
    const duplicate = await (await post('/api/invoices', input)).json(); assert.equal(duplicate.id, record.id);
    const a = Keypair.random(), b = Keypair.random();
    const tx = new TransactionBuilder(new Account(a.publicKey(), '1'), { fee: '1000', networkPassphrase: Networks.TESTNET })
      .addOperation(Operation.payment({ destination: b.publicKey(), amount: record.assetAmount, asset: new Asset('CHUSD', a.publicKey()) }))
      .addMemo(Memo.text(record.memo)).setTimebounds(0, record.expiresAt).build();
    tx.sign(a);
    const prepared = await post(`/api/invoices/${record.id}/prepare`, { xdr: tx.toXDR() }); assert.equal(prepared.status, 200);
    await stop(); await start();
    const saved = await (await fetch(origin + '/api/invoices')).json();
    assert.equal(saved.length, 1); assert.equal(saved[0].status, 'prepared'); assert.equal(saved[0].hash, tx.hash().toString('hex'));
    assert.equal(saved[0].xdr, tx.toXDR()); assert.deepEqual(saved[0].journal, []);
    assert.equal((await post(`/api/invoices/${record.id}/prepare`, { xdr: 'invalid' })).status, 400);
  } finally { if (child) await stop(); await rm(data, { recursive: true, force: true }); }
});
