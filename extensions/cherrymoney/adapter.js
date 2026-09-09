// Same-origin authenticated Laravel API; no browser-owned invoice database in full-app mode.
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
