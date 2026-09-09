/* Disposable keys remain in memory. Only signed, expiring TESTNET XDR is persisted. */
(() => {
const workspace = document.getElementById('cherry-stellar') || document.querySelector('main');
if (!workspace) return;
const $ = id => workspace.querySelector('#' + id);
const S = window.StellarSdk;
const HORIZON = 'https://horizon-testnet.stellar.org';
let selected, records = [], busy = false;
let requestId = crypto.randomUUID();
const gbp = pence => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(pence / 100);
const message = text => { $('message').textContent = text; };
async function api(path, body) {
  if (window.CherryApi) return window.CherryApi(path, body);
  const response = await fetch('/api/' + path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Request failed.');
  return result;
}
async function external(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(45000) });
  if (!response.ok) throw new Error('Testnet request could not be confirmed. Use Check settlement before retrying.');
  return response.json();
}
function rows(target, values) {
  $(target).replaceChildren(...values.map(([label, value]) => {
    const row = document.createElement('div'), dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = label; dd.textContent = value; row.append(dt, dd); return row;
  }));
}
function render() {
  $('details').hidden = !selected; $('empty').hidden = !!selected;
  $('state').textContent = selected?.status.toUpperCase() || 'READY';
  $('evidence').hidden = !selected?.hash;
  const purchase = selected?.purchaseInvoice;
  $('purchase-invoice-record').hidden = !purchase || !/^\d+$/.test(String(purchase.id));
  if (!$('purchase-invoice-record').hidden) {
    $('purchase-invoice-link').href = `/purchase-invoice/${purchase.id}/edit`;
    $('purchase-invoice-link').textContent = `Open Cherry Money purchase invoice ${purchase.number}`;
  }
  workspace.querySelectorAll('button').forEach(button => { button.disabled = busy; });
  if (!selected) return;
  const r = selected;
  $('supplier-title').textContent = `${r.supplier} · ${r.country} · ${r.memo}`;
  $('token-amount').textContent = `${Number(r.assetAmount).toLocaleString('en-GB', { maximumFractionDigits: 4 })} CHUSD`;
  rows('quote-lines', [['Invoice principal', gbp(r.pence)], ['Illustrative FX rate', `GBP 1 = ${r.rate} CHUSD`], ['Simulated service fee', gbp(r.feePence)], ['Simulated GBP funding', gbp(r.fundingPence)]]);
  $('deadline').textContent = `Quote / payment deadline: ${new Date(r.expiresAt * 1000).toLocaleString()}`;
  const expired = Date.now() >= r.expiresAt * 1000;
  $('pay').disabled = busy || expired || !['quoted', 'prepared'].includes(r.status);
  $('pay').textContent = r.status === 'prepared' ? 'Resume same payment' : expired ? 'Quote expired' : 'Send testnet payment';
  $('check').disabled = busy || r.status !== 'prepared';
  if (r.hash) {
    rows('proof', [['Transaction hash', r.hash], ['Asset issuer / sender', r.issuer], ['Recipient test account', r.recipient], ['Status', r.status], ['Stellar ledger', r.ledger || 'Awaiting confirmation'], ['Payment network fee', r.networkFeeStroops ? `${(r.networkFeeStroops / 1e7).toFixed(7)} test XLM` : 'Awaiting confirmation']]);
    $('explorer').href = `https://stellar.expert/explorer/testnet/tx/${r.hash}`;
    $('journal').replaceChildren(...r.journal.map(entry => {
      const row = document.createElement('tr');
      const divisor = entry.unit === 'GBP pence' ? 100 : 1e7;
      for (const value of [entry.event, entry.account, (entry.debit / divisor).toFixed(divisor === 100 ? 2 : 7), (entry.credit / divisor).toFixed(divisor === 100 ? 2 : 7), divisor === 100 ? 'GBP (simulated)' : 'Test XLM']) {
        const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
      }
      return row;
    }));
  }
}
async function refresh() {
  records = await api('invoices');
  if (selected) selected = records.find(r => r.id === selected.id);
  $('history').replaceChildren(...records.map(record => {
    const button = document.createElement('button'), status = document.createElement('span');
    button.type = 'button'; button.append(document.createTextNode(`${record.supplier} · ${gbp(record.pence)}`));
    status.textContent = record.status; button.append(status);
    button.onclick = () => { selected = record; render(); message('Invoice loaded.'); };
    return button;
  }));
  if (!records.length) $('history').textContent = 'No invoices yet.';
  render();
}
async function action(fn) {
  if (busy) return;
  busy = true; render();
  try {
    if (window.CherryApi) {
      if (!navigator.locks) throw new Error('Use a current browser with Web Locks support to safely run this hosted demo.');
      await navigator.locks.request('cherry-stellar-payment', fn);
    } else await fn();
  }
  catch (error) { message(error.message); }
  finally { busy = false; await refresh().catch(error => message(error.message)); render(); }
}
async function confirm() {
  selected = await api(`invoices/${selected.id}/confirm`, {}); render();
  message(selected.status === 'reconciled' ? 'Payment verified on Stellar testnet. Invoice reconciled and demo journal recorded.' : selected.status === 'failed' ? 'Stellar reports this payment failed. No reconciliation was posted.' : 'Payment is not yet confirmed. Check settlement again; retries use the same transaction.');
}
async function pay() {
  if (!S) throw new Error('Stellar SDK did not load. Run npm ci and reload.');
  // Always reload durable state first: this also recovers an ambiguous prepare response.
  await refresh();
  if (selected.status === 'quoted') {
    message('Creating disposable test accounts and funding them with free test XLM…');
    const sender = S.Keypair.random(), recipient = S.Keypair.random();
    await external(`https://friendbot.stellar.org?addr=${sender.publicKey()}`);
    await external(`https://friendbot.stellar.org?addr=${recipient.publicKey()}`);
    const asset = new S.Asset('CHUSD', sender.publicKey());
    const destination = await external(`${HORIZON}/accounts/${recipient.publicKey()}`);
    const trust = new S.TransactionBuilder(new S.Account(destination.account_id, destination.sequence), { fee: '1000', networkPassphrase: S.Networks.TESTNET })
      .addOperation(S.Operation.changeTrust({ asset, limit: '100000' })).setTimeout(180).build();
    trust.sign(recipient);
    message('Opening the supplier’s test-token trustline…');
    await external(`${HORIZON}/transactions`, { method: 'POST', body: new URLSearchParams({ tx: trust.toXDR() }) });
    const source = await external(`${HORIZON}/accounts/${sender.publicKey()}`);
    const payment = new S.TransactionBuilder(new S.Account(source.account_id, source.sequence), { fee: '1000', networkPassphrase: S.Networks.TESTNET })
      .addOperation(S.Operation.payment({ destination: recipient.publicKey(), asset, amount: selected.assetAmount }))
      .addMemo(S.Memo.text(selected.memo)).setTimebounds(0, selected.expiresAt).build();
    payment.sign(sender);
    message('Saving the signed testnet payment before submission…');
    selected = await api(`invoices/${selected.id}/prepare`, { xdr: payment.toXDR() });
    render();
  }
  if (selected.status !== 'prepared') return;
  await confirm();
  if (selected.status !== 'prepared') return;
  if (Date.now() >= selected.expiresAt * 1000) throw new Error('Payment window expired. Continue checking settlement; do not create a replacement for an unresolved payment.');
  message('Submitting the saved payment to Stellar testnet…');
  try {
    await external(`${HORIZON}/transactions`, { method: 'POST', body: new URLSearchParams({ tx: selected.xdr }) });
  } catch (error) {
    await confirm();
    if (selected.status !== 'reconciled') throw error;
    return;
  }
  // Horizon submission is synchronous; short retries cover indexing delays.
  for (let i = 0; i < 4 && selected.status === 'prepared'; i++) {
    await confirm();
    if (selected.status === 'prepared') await new Promise(resolve => setTimeout(resolve, 1500));
  }
}
$('invoice-form').onsubmit = event => { event.preventDefault(); action(async () => {
  const input = Object.fromEntries(new FormData(event.target));
  selected = await api('invoices', { ...input, requestId });
  requestId = crypto.randomUUID(); message('Quote ready. Send a testnet payment when you are ready.');
}); };
$('pay').onclick = () => action(pay);
$('check').onclick = () => action(confirm);
$('refresh').onclick = () => action(refresh);
refresh().catch(error => message(error.message));
})();
