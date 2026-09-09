// Same-origin authenticated Laravel API; no browser-owned invoice database in full-app mode.
const invoiceNotice = document.createElement('p');
invoiceNotice.className = 'notice';
invoiceNotice.textContent = 'Sending a testnet payment also creates an unpaid draft purchase invoice in your Cherry Money company. It is marked TESTNET DEMO. Review it under Purchases; do not approve it as a real supplier bill.';
document.querySelector('main').prepend(invoiceNotice);
window.CherryApi = async (path, body) => {
  const response = await fetch('/stellar/api/' + path, {
    method: body === undefined ? 'GET' : 'POST',
    credentials: 'same-origin',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json',
      'X-CSRF-TOKEN': document.querySelector('meta[name="csrf-token"]').content },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 401 || response.status === 419 || response.redirected) throw new Error('Session expired. Sign in to Cherry Money and reopen this invoice.');
  const result = await response.json();
  if (!response.ok) throw new Error(result.message || 'Unable to save or verify this payment.');
  return result;
};
