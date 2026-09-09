# Cherry Money is the application base

Cherry Stellar now has two delivery modes:

| Mode | Base and data | Intended access |
| --- | --- | --- |
| Full application | Private Cherry Money application plus this repository's Stellar extension; company-scoped SQL demo records | Developers/operators with Cherry Money repository access |
| Public Vercel demonstration | Standalone invoice/payment lab; visitor-local browser records | Judges and public visitors |

`base/cherrymoney` is a Git submodule, pinned to the exact commit in `base.lock.json`. It is the full base application, not a selection of copied features. The public repository contains the private repository reference and original extension code, **not the private source or its history**. Public clones without private access can still run the standalone demonstration without initializing the submodule.

## Features inherited from the base

The full application retains the base's routes, models, controllers, migrations, templates, dependency lockfiles and assets, including login/users/companies/permissions, sales invoices and quotes, purchases and suppliers, expenses and payments, ledgers and accounting reports, banking integrations, VAT/UK compliance, payroll, subscriptions and administration. Availability still follows the existing company type, permissions, subscription and integration configuration. Linking source does not activate paid services, restore expired Finexer access or grant regulatory permissions.

The extension adds a **Stellar payment lab** link to the assembled application's menu and `/stellar` routes under the existing login, web/CSRF, subscription and purchase-permission middleware. It independently checks active company and permission and stores demo invoices, immutable signed envelopes and reconciliation evidence in `cherry_stellar_invoices`, scoped to the authenticated company. Client requests cannot choose a company or submit a trusted journal. Records are saved before broadcast. Verification uses the same Node SDK logic as the public demo through a private loopback service.

Testnet payments still reconcile **demo invoices only**. They do not settle real supplier invoices or alter live accounting. Mapping test tokens to live payables would be a separate production change.

## Set up the full application

Prerequisites: Git access to both repositories, Node 22, PHP 8.2/Composer and the extensions/database required by Cherry Money. Use a separate development database and fictional supplier data.

```bash
git clone git@github.com:sohamtech-uk/cherry-stellar.git
cd cherry-stellar
git switch feat/cherrymoney-base
git submodule update --init base/cherrymoney
npm ci --ignore-scripts
npm run base:assemble
```

The script checks the pinned commit and refuses a dirty base. It archives the complete private base into `.runtime/cherry-stellar`, adds the extension and keeps the base checkout unchanged. It refuses to overwrite an existing assembly, preserving its configuration and data. The runtime contains private code and must never be committed, uploaded to a public artifact, or deployed from the public Vercel project.

In a terminal at the Cherry Stellar repository root, start the private verifier:

```bash
npm run start:verifier
```

It binds only to `127.0.0.1:3001` by default. It has no public authentication layer; do not expose it to the Internet. The optional `STELLAR_VERIFIER_CONTAINER=true` setting is only for a private container network, with no published verifier port. The PHP verifier URL then must be `http://stellar-verifier:3001`.

In another terminal:

```bash
cd .runtime/cherry-stellar
composer install
npm install
npm run build
cp .env.example .env
```

Set the following in this **new runtime's** `.env`, alongside its own `DB_*` values:

```dotenv
APP_NAME="Cherry Stellar"
APP_URL=http://localhost:8000
CHERRY_STELLAR_ENABLED=true
CHERRY_STELLAR_VERIFIER_URL=http://127.0.0.1:3001
```

Finish the base's normal fresh-environment setup:

```bash
php artisan key:generate
php artisan migrate
php artisan db:seed --class=CountrySeeder
php artisan config:clear
php artisan serve
```

Follow the private base README for other required settings and normal company/admin onboarding. No production credentials or licence bypasses are supplied. Sign in to an active company with purchasing access; use the existing application features and open **Stellar payment lab** from the sidebar.

## Hosting

The full application needs PHP, a persistent SQL database, durable uploads and a private Node verifier. Use the base's established PHP/container hosting infrastructure with its own secrets and configuration. This PR does not deploy the full application or alter the existing Vercel demo. Vercel's current static/Node deployment cannot supply the full Laravel runtime as configured.

`.vercelignore` excludes the private submodule and assembled runtime. Public GitHub CI explicitly leaves submodules uninitialised and tests the extension against Laravel fixtures. Full-base installation and application smoke tests must run in an authorised private environment; passing fixture tests alone does not certify every upstream feature.

## Update the base deliberately

Review a newer Cherry Money commit, update the submodule gitlink and `base.lock.json` together, then assemble in a fresh checkout. Do not use a floating upstream branch in a production build. Changes to upstream bootstrap/menu insertion points fail assembly and require review. The only base source edits made during assembly are provider registration and the menu entry; Stellar files and migration are additive.

Cherry Money PR #127 was closed without merging. This arrangement uses Cherry Money main as the base and maintains the Stellar extension here. It does not reopen or depend on that PR's feature branch.
