// Private sidecar for the Laravel extension. Never expose this port to the Internet.
import http from 'node:http';
import { hostedAction } from '../hosted.mjs';
const host = process.env.STELLAR_VERIFIER_CONTAINER === 'true' ? '0.0.0.0' : '127.0.0.1';
http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method !== 'POST' || req.url !== '/verify' || req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('JSON verification request required.');
    let body = '';
    for await (const chunk of req) { body += chunk; if (Buffer.byteLength(body) > 24000) throw new Error('Request too large.'); }
    res.end(JSON.stringify(await hostedAction(JSON.parse(body))));
  } catch { res.statusCode = 400; res.end(JSON.stringify({ error: 'Verification failed; retain any saved payment and check settlement again.' })); }
}).listen(3001, host, () => console.log('Stellar verifier ready on private port 3001.'));
