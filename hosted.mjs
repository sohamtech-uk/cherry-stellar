// Hosted demo records are visitor-owned and untrusted; settlement is verified afresh.
import { invoice, prepare, reconcile, assert } from './domain.mjs';

export async function hostedAction(input, fetcher = fetch) {
  if (input.action === 'quote') return invoice(input.input);
  assert(['prepare', 'confirm'].includes(input.action), 'Unknown action.');
  const saved = input.record;
  assert(saved && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(saved.id), 'Invalid invoice ID.');
  assert(Number.isSafeInteger(saved.pence), 'Invalid invoice amount.');
  const created = Date.parse(saved.createdAt);
  assert(Number.isFinite(created) && created <= Date.now() + 1000, 'Invalid invoice date.');
  const record = invoice({ supplier: saved.supplier, country: saved.country, amount: (saved.pence / 100).toFixed(2), requestId: saved.requestId }, created);
  record.id = saved.id;
  record.memo = `CH-${record.id.replaceAll('-', '').slice(0, 24)}`;
  // Never trust a browser-provided status, journal, quote rate, hash or account binding.
  const xdr = input.action === 'prepare' ? input.xdr : saved.xdr;
  // For confirmation only, validate historical envelopes against their original quote.
  prepare(record, xdr, [], input.action === 'confirm' ? created : Date.now());
  if (input.action === 'confirm') await reconcile(record, fetcher);
  return record;
}
