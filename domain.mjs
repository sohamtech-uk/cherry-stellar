import { randomUUID } from 'node:crypto';
import { TransactionBuilder, Networks, StrKey, Keypair } from '@stellar/stellar-sdk';

export const HORIZON = 'https://horizon-testnet.stellar.org';
export const NETWORK = Networks.TESTNET;
export const CODE = 'CHUSD';
export function assert(ok, message) { if (!ok) throw new Error(message); }
export function invoice(input, now = Date.now()) {
  assert(typeof input.supplier === 'string' && input.supplier.trim().length > 0 && input.supplier.length <= 120, 'Enter a supplier name (up to 120 characters).');
  assert(typeof input.country === 'string' && /^[A-Z]{2}$/.test(input.country), 'Choose a supplier country.');
  assert(typeof input.amount === 'string' && /^\d{1,5}(\.\d{1,2})?$/.test(input.amount), 'Enter a GBP amount with up to two decimal places.');
  const [whole, fraction = ''] = input.amount.split('.');
  const pence = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));
  assert(pence >= 100 && pence <= 1_000_000, 'Invoice must be between GBP 1 and GBP 10,000.');
  assert(typeof input.requestId === 'string' && /^[a-f0-9-]{36}$/.test(input.requestId), 'Missing request identifier.');
  const id = randomUUID();
  return { id, requestId: input.requestId, supplier: input.supplier.trim(), country: input.country,
    pence, feePence: 50, fundingPence: pence + 50, rate: '1.28',
    assetAmount: (pence * 128 / 10000).toFixed(7), code: CODE,
    createdAt: new Date(now).toISOString(), expiresAt: Math.floor(now / 1000) + 900,
    memo: `CH-${id.replaceAll('-', '').slice(0, 24)}`, status: 'quoted', journal: [] };
}

export function prepare(record, xdr, allRecords, now = Date.now()) {
  assert(typeof xdr === 'string' && xdr.length < 16000, 'Invalid signed transaction.');
  if (record.status !== 'quoted') {
    assert(record.xdr === xdr, 'An invoice can only bind to one payment.');
    return record;
  }
  assert(Math.floor(now / 1000) < record.expiresAt, 'Quote expired. Create a new invoice.');
  const tx = TransactionBuilder.fromXDR(xdr, NETWORK);
  const op = tx.operations?.[0];
  assert(tx.operations?.length === 1 && op.type === 'payment', 'Exactly one payment is required.');
  assert(StrKey.isValidEd25519PublicKey(tx.source) && StrKey.isValidEd25519PublicKey(op.destination) && tx.source !== op.destination, 'Invalid test accounts.');
  assert(!op.source || op.source === tx.source, 'Unexpected operation source.');
  assert(op.asset.code === CODE && op.asset.issuer === tx.source && op.amount === record.assetAmount, 'Payment does not match the quote.');
  assert(tx.memo.type === 'text' && tx.memo.value.toString() === record.memo, 'Wrong invoice memo.');
  assert(tx.timeBounds?.minTime === '0' && Number(tx.timeBounds.maxTime) === record.expiresAt, 'Wrong payment deadline.');
  assert(Number(tx.fee) > 0 && Number(tx.fee) <= 100000, 'Payment network fee exceeds demo limit.');
  assert(tx.signatures.length === 1 && Keypair.fromPublicKey(tx.source).verify(tx.hash(), tx.signatures[0].signature()), 'Invalid testnet signature.');
  const hash = tx.hash().toString('hex');
  assert(!allRecords.some(r => r.id !== record.id && r.hash === hash), 'Payment already assigned.');
  Object.assign(record, { status: 'prepared', xdr, hash, issuer: tx.source, recipient: op.destination });
  return record;
}

export async function horizon(path, fetcher = fetch) {
  const response = await fetcher(HORIZON + path, { signal: AbortSignal.timeout(20000) });
  if (response.status === 404) return null;
  assert(response.ok, 'Stellar testnet is temporarily unavailable. Check settlement again.');
  return response.json();
}

export async function reconcile(record, fetcher = fetch) {
  if (record.status === 'reconciled' || record.status === 'failed') return record;
  assert(record.status === 'prepared', 'Prepare the payment first.');
  const root = await horizon('/', fetcher);
  assert(root?.network_passphrase === NETWORK, 'Unexpected Stellar network.');
  const tx = await horizon(`/transactions/${record.hash}`, fetcher);
  if (!tx) return record; // Missing evidence is never a failed payment.
  assert(tx.hash === record.hash && tx.source_account === record.issuer, 'Transaction evidence mismatch.');
  if (tx.successful === false) { record.status = 'failed'; return record; }
  const operations = await horizon(`/transactions/${record.hash}/operations?limit=2`, fetcher);
  const ops = operations?._embedded?.records;
  const op = ops?.[0];
  const settled = Date.parse(tx.created_at) / 1000;
  assert(tx.successful === true && tx.operation_count === 1 && ops?.length === 1, 'Expected one successful payment.');
  assert(tx.memo_type === 'text' && tx.memo === record.memo, 'Wrong invoice memo in settlement.');
  assert(Number.isFinite(settled) && settled >= Date.parse(record.createdAt) / 1000 - 1 && settled <= record.expiresAt, 'Payment outside quote window.');
  assert(op.type === 'payment' && op.from === record.issuer && op.to === record.recipient && op.asset_code === CODE && op.asset_issuer === record.issuer && op.amount === record.assetAmount, 'Settlement does not match the invoice.');
  const fee = Number(tx.fee_charged);
  assert(Number.isSafeInteger(fee) && fee > 0 && fee <= 100000, 'Invalid network fee.');
  assert(Number.isSafeInteger(tx.ledger) && tx.ledger > 0, 'Invalid ledger.');
  const entries = [];
  const pair = (event, debit, credit, amount, unit) => {
    entries.push({ event, account: debit, debit: amount, credit: 0, unit }, { event, account: credit, debit: 0, credit: amount, unit });
  };
  pair('Invoice', 'Demo purchases', 'Supplier payable', record.pence, 'GBP pence');
  pair('Simulated funding', 'Token clearing', 'Simulated GBP bank', record.pence, 'GBP pence');
  pair('Illustrative fee', 'Service fee', 'Simulated GBP bank', record.feePence, 'GBP pence');
  pair('Settlement', 'Supplier payable', 'Token clearing', record.pence, 'GBP pence');
  pair('Network fee', 'Testnet network expense', 'Test XLM balance', fee, 'XLM stroops');
  Object.assign(record, { status: 'reconciled', settledAt: tx.created_at, ledger: tx.ledger, networkFeeStroops: fee, journal: entries });
  return record;
}
