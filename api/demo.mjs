import { hostedAction } from '../hosted.mjs';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST required.' });
  try {
    const origin = req.headers.origin;
    const expected = `https://${req.headers.host}`;
    if (origin !== expected || req.headers['content-type']?.split(';')[0] !== 'application/json') throw new Error('Same-origin JSON request required.');
    if (Number(req.headers['content-length']) > 24000) throw new Error('Request too large.');
    const input = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    if (!input || JSON.stringify(input).length > 24000) throw new Error('Invalid request.');
    const result = await hostedAction(input);
    return res.status(200).json(result);
  } catch (error) { return res.status(400).json({ error: error.message || 'Unable to verify payment.' }); }
}
