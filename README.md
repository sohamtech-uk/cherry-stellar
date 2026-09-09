# Cherry Stellar

A Cherry Money–based application with a Stellar testnet extension, plus a shareable standalone demonstration: invoice → illustrative GBP quote → testnet payment → verified reconciliation.

**Full application:** use the private Cherry Money base pinned in `base/cherrymoney` and `base.lock.json`. This retains all existing application features and adds Stellar under the existing login, company permissions and database. [Full application setup and architecture](docs/cherrymoney-base.md).

Initiating a payment in the full application creates a linked **unpaid draft supplier purchase invoice** in Cherry Money before broadcast. Retries reuse it. Testnet settlement leaves that native draft unpaid and records the demo reconciliation separately.

**Public demo:** the instructions below run the standalone payment lab, without Finexer connectivity. The public repository contains independently authored extension/demo code and a private base reference; it does not publish Cherry Money's source, data, credentials or Git history. Authorised access is required to initialise the full base.

## Vercel hosted mode

Live demo: **https://cherry-stellar-beta.vercel.app/**

`npm run build` creates static assets in `dist`; `api/demo.mjs` provides stateless quote/envelope/settlement verification. `vercel.json` configures both. No database credentials or wallet secrets are needed.

**Hosted storage differs from local mode:** each visitor's invoices, signed envelopes and journals persist in their own browser's IndexedDB, isolated by site origin. They are not stored in a shared server ledger, synchronized across devices or backed up. Clearing site data loses the local payment history; do not clear it while a payment is unresolved. Private browsing may discard history at session end.

The server reconstructs illustrative quotes and validates signatures and live Horizon evidence; it never trusts a submitted status, journal, rate or hash. Browser records are visitor-controlled demo data, not tamper-proof accounting. Duplicate prevention is scoped to that browser using IndexedDB unique indexes, atomic writes and Web Locks. The hosted demo is not a multi-user financial service.

To deploy your own copy on Vercel, import the feature branch and use the included configuration. Keep existing Vercel deployment protection settings. Wallet secrets remain browser-memory-only in both modes. The local file server below is unchanged and must still remain loopback-only.

## Run locally

Install **Node.js 22**, then:

```bash
git clone https://github.com/sohamtech-uk/cherry-stellar.git
cd cherry-stellar
git switch feat/stellar-payment-demo
npm ci --ignore-scripts
npm start
```

Open **http://localhost:3000**. No account, wallet, API key or environment file is needed. The Stellar SDK is served locally from the pinned npm dependency; the browser does not load executable code from a CDN.

The implementation is on `feat/stellar-payment-demo`, with a PR into `develop`. Once merged, you can use `develop` instead.

The server intentionally binds to `127.0.0.1`. This is a single-user local demonstration, not a public multi-user service. Do not expose it through a tunnel or reverse proxy. Share this repository so others can run their own copy. Public hosting would require authentication, tenant isolation, durable database storage, rate limiting and operational review.

## Two-minute walkthrough

1. Enter a fictional overseas supplier and create a **GBP 100** invoice.
2. Review **128 CHUSD**, a **GBP 0.50** illustrative service fee and **GBP 100.50** simulated funding. The fixed illustrative FX rate is **GBP 1 = CHUSD 1.28**; it is not a market quote.
3. Click **Send testnet payment**. Friendbot supplies free test XLM to disposable accounts; a trustline is created and the CHUSD issuer sends tokens to the generated supplier account.
4. Inspect the transaction hash, recipient, issuer, explorer link and network fee.
5. Wait for **reconciled**. The server verifies Horizon evidence and records a balanced demo journal.
6. Reload and reopen the invoice. A prepared payment can be resumed using its original signed transaction; **Check settlement** never sends a new payment.

Supplier country is a scenario label. It does not represent fiat payout coverage. Use fictional supplier information: transaction hashes, memos and account addresses are public on testnet.

## What is simulated?

| Step | Behaviour |
| --- | --- |
| Invoice | Locally persisted demo record |
| GBP funding | Simulated, no bank connection |
| FX and service fee | Illustrative fixed rate and GBP 0.50; no fee collected |
| Asset | CHUSD, a worthless, non-redeemable test token; not USDC or a backed stablecoin |
| Stellar transfer | Actual testnet transaction using free test assets |
| Reconciliation | Server checks the transaction and posts an isolated demo journal |
| Overseas bank payout | Not implemented |

There is no mainnet switch, secret-key import, regulated payment service or production accounting connection. Stellar testnet does not replace AIS/PIS connectivity.

## Persistence and recovery

Invoices, fixed quotes, public account IDs, bounded signed envelopes, hashes and journals live in `data/invoices.json` (Git-ignored). Secret keys exist only in browser memory. The sender doubles as issuer solely for this demo. No reusable treasury is maintained.

- State: `quoted` → `prepared` → `reconciled` or confirmed on-chain `failed`.
- Quotes last 15 minutes. The signed payment has the same maximum time.
- A signed envelope is validated and persisted **before broadcast**. Its testnet signature, source, destination, asset, exact amount, memo, fee and deadline are checked.
- An invoice cannot switch to another signed payment. Hashes cannot be assigned to two invoices.
- A timeout, HTTP 404 or service outage leaves a payment unresolved. Reload, select the invoice and use **Check settlement** or **Resume same payment** while the time window is open.
- Expired unresolved payments remain check-only. Do not create a replacement invoice for an unresolved payment. An on-time settlement may be reconciled after the quote expires.
- Writes are serialized and committed by atomic file rename. A single-process lock prevents two servers from sharing the same data file. Do not use network filesystems or multiple workers. This is not a production database.
- Ctrl+C shuts down cleanly. After an abnormal crash, first confirm no server is using the directory, then remove `data/server.lock` to restart. Do not delete invoice data merely to retry a payment.
- Stellar testnet resets can erase network evidence. Local reconciled records remain historical demo evidence, not proof of current balances. Start new invoices for a new testnet session.

The default port is 3000 (`PORT` can override it). `DATA_DIR` can point to a different private local directory.

## Accounting

The journal records invoice purchases/payables, simulated GBP funding, the illustrative service fee, supplier settlement and the actual invoice-payment network fee. GBP is represented in integer pence and XLM in integer stroops; each currency balances independently. Trustline/account setup fees are not included in the displayed invoice payment fee. This is a demonstrator, not financial or tax reporting software.

## Verification

```bash
npm test
node --check public/app.js
```

Offline tests cover quote arithmetic and validation, signed-envelope binding, mainnet rejection, expiry, hash reuse, evidence mismatches, uncertain responses, failed transactions, balanced/idempotent reconciliation, HTTP origin protection and persistence across restart. GitHub Actions runs them on Node 22.

Optional live network test (creates disposable accounts and sends **1.28 CHUSD**):

```bash
npm run test:live
```

This prints a testnet hash and verifies actual settlement through the same server-side reconciliation logic. It does not exercise the browser interface; use the walkthrough above for that.

Verified on 9 September 2026: **24 automated tests passed**, the hosted build passed, and the dependency audit reported no known vulnerabilities. A full browser walkthrough on Vercel created a GBP 1 demo invoice, sent **1.28 CHUSD**, reconciled at ledger **4584384** with **100 stroops** payment fee and **10 journal entries**, then restored the same reconciled record after reload. [View the hosted browser test transaction](https://stellar.expert/explorer/testnet/tx/d7c1d87646aa69b82c32a267383758756578925f3387695d94a2cca4c1240a13).

An earlier independent local smoke test also reconciled [this testnet transaction](https://stellar.expert/explorer/testnet/tx/7d6cee65f313944cd970d6661023a570a9a44812b19d269b856751d76271df1c). Testnet history may disappear at a network reset.

Network access is required to `friendbot.stellar.org` and `horizon-testnet.stellar.org`. Friendbot can be slow or rate limited. A setup error before payment preparation may leave harmless funded test accounts; reload and try again. After preparation always check the saved payment first.

## Architecture and references

- `server.mjs`: localhost HTTP API, local persistence and origin/Host checks.
- `domain.mjs`: quotes, signed-payment validation, Horizon verification and journal generation.
- `public/`: browser payment workflow and responsive UI.
- `test/`: offline domain and HTTP integration tests.
- `scripts/live.mjs`: explicit opt-in testnet smoke test.

Built with Node.js 22 and the official `@stellar/stellar-sdk` 17.0.1 (pinned with a lockfile). The SDK upgrade includes byte-array/signature API adaptations. `npm audit --omit=dev` reported no known vulnerabilities on 9 September 2026. No Laravel, private repository or Finexer dependency.

Official references: [Stellar networks and testnet resets](https://developers.stellar.org/docs/networks), [creating and funding accounts](https://developers.stellar.org/docs/build/guides/transactions/create-account), [Stellar JavaScript SDK](https://github.com/stellar/js-stellar-sdk).

For hackathons, disclose this pre-event work and confirm the organisers' rules. A public repository alone does not grant an open-source licence; no licence has been selected for this original application code. Third-party packages retain their own licences.
