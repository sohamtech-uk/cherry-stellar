import http from 'node:http';
import { readFile, mkdir, writeFile, rename, open, unlink } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { invoice, prepare, reconcile, assert } from './domain.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const port = Number(process.env.PORT || 3000);
const storage = resolve(process.env.DATA_DIR || resolve(root, 'data'));
await mkdir(storage, { recursive: true, mode: 0o700 });
// One process owns this file store. Do not run multiple workers against it.
const lockPath = resolve(storage, 'server.lock');
const lock = await open(lockPath, 'wx').catch(() => { throw new Error('Data directory is locked. Stop the other server; after a crash remove data/server.lock before restarting.'); });
const dbPath = resolve(storage, 'invoices.json');
let db;
try { db = JSON.parse(await readFile(dbPath, 'utf8')); }
catch (e) { if (e.code === 'ENOENT') db = []; else throw e; }
let queue = Promise.resolve();
async function mutate(fn) {
  const job = queue.then(async () => {
    const next = structuredClone(db);
    const result = await fn(next);
    await writeFile(dbPath + '.tmp', JSON.stringify(next, null, 2), { mode: 0o600 });
    await rename(dbPath + '.tmp', dbPath);
    db = next;
    return result;
  });
  queue = job.catch(() => {});
  return job;
}
const assets = {
  '/': ['public/index.html', 'text/html'],
  '/app.js': ['public/app.js', 'text/javascript'],
  '/style.css': ['public/style.css', 'text/css'],
  '/stellar-sdk.js': ['node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js', 'text/javascript'],
};
function respond(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(data));
}
const server = http.createServer(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' https://horizon-testnet.stellar.org https://friendbot.stellar.org; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const validHosts = [`localhost:${port}`, `127.0.0.1:${port}`];
    assert(validHosts.includes(req.headers.host), 'Use the localhost address printed by the server.');
    const path = new URL(req.url, `http://localhost:${port}`).pathname;
    if (req.method === 'GET' && assets[path]) {
      const [file, type] = assets[path];
      const contents = await readFile(resolve(root, file));
      res.writeHead(200, { 'Content-Type': type }); return res.end(contents);
    }
    if (req.method === 'GET' && path === '/api/invoices') return respond(res, 200, db);
    if (req.method !== 'POST' || !path.startsWith('/api/')) return respond(res, 404, { error: 'Not found' });
    assert(req.headers.origin === `http://${req.headers.host}`, 'Cross-origin requests are not allowed.');
    assert(req.headers['content-type']?.split(';')[0] === 'application/json', 'JSON required.');
    let body = '';
    for await (const chunk of req) { body += chunk; assert(Buffer.byteLength(body) <= 20000, 'Request too large.'); }
    const input = JSON.parse(body);
    const result = await mutate(async records => {
      if (path === '/api/invoices') {
        const candidate = invoice(input);
        const existing = records.find(r => r.requestId === candidate.requestId);
        if (existing) {
          assert(existing.supplier === candidate.supplier && existing.country === candidate.country && existing.pence === candidate.pence, 'Request identifier already used for another invoice.');
          return existing;
        }
        assert(records.length < 500, 'Demo limit reached. Archive the local data directory to start a fresh demo.');
        records.unshift(candidate); return candidate;
      }
      const match = /^\/api\/invoices\/([a-f0-9-]{36})\/(prepare|confirm)$/.exec(path);
      assert(match, 'Unknown action.');
      const record = records.find(r => r.id === match[1]);
      assert(record, 'Invoice not found.');
      return match[2] === 'prepare' ? prepare(record, input.xdr, records) : reconcile(record);
    });
    respond(res, 200, result);
  } catch (error) { respond(res, 400, { error: error.message || 'Unable to complete request.' }); }
});
server.listen(port, '127.0.0.1', () => console.log(`Cherry Stellar demo: http://localhost:${port} — testnet only`));
async function stop() {
  server.close();
  await queue;
  await lock.close(); await unlink(lockPath); process.exit(0);
}
process.on('SIGINT', stop); process.on('SIGTERM', stop);
