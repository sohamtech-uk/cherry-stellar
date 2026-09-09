/* Hosted mode: IndexedDB owns visitor-local demo history; never stores secret keys. */
(() => {
  const database = new Promise((resolve, reject) => {
    const request = indexedDB.open('cherry-stellar-demo-v1', 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore('invoices', { keyPath: 'id' });
      store.createIndex('requestId', 'requestId', { unique: true });
      store.createIndex('hash', 'hash', { unique: true });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('Browser storage unavailable. Enable site storage to use the demo.'));
  });
  async function transaction(mode, fn) {
    const db = await database;
    return new Promise((resolve, reject) => {
      const tx = db.transaction('invoices', mode);
      let result;
      tx.oncomplete = () => resolve(result);
      tx.onabort = tx.onerror = () => reject(new Error('Could not save demo record. No new payment should be sent until storage works.'));
      fn(tx.objectStore('invoices'), value => { result = value; }, tx);
    });
  }
  const list = () => transaction('readonly', (store, done) => {
    const request = store.getAll(); request.onsuccess = () => done(request.result.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
  });
  const save = record => transaction('readwrite', (store, done, tx) => {
    const request = store.get(record.id);
    request.onsuccess = () => {
      const old = request.result;
      if (old?.xdr && old.xdr !== record.xdr) return tx.abort();
      // Never regress a completed local record because an older request finished later.
      if (old?.status === 'reconciled') { done(old); return; }
      store.put(record); done(record);
    };
  });
  async function remote(input) {
    const response = await fetch('/api/demo', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(60000) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Verification unavailable. Try Check settlement again.');
    return result;
  }
  window.CherryApi = async (path, body) => {
    const records = await list();
    if (path === 'invoices' && body === undefined) return records;
    if (path === 'invoices') {
      const existing = records.find(r => r.requestId === body.requestId);
      if (existing) return existing;
      if (records.length >= 500) throw new Error('This browser has reached the demo invoice limit.');
      return save(await remote({ action: 'quote', input: body }));
    }
    const match = /^invoices\/([a-f0-9-]{36})\/(prepare|confirm)$/.exec(path);
    const record = match && records.find(r => r.id === match[1]);
    if (!record) throw new Error('Invoice not found in this browser.');
    if (match[2] === 'prepare' && record.xdr) {
      if (body.xdr !== record.xdr) throw new Error('Invoice already has a different saved payment. Reload it.');
      return record;
    }
    return save(await remote({ action: match[2], record, xdr: body.xdr }));
  };
  const notice = document.createElement('p');
  notice.className = 'notice';
  notice.textContent = 'Your demo invoices are saved only in this browser. Clearing site data removes them; other devices cannot see them. Use fictional supplier details.';
  document.querySelector('main').prepend(notice);
})();
