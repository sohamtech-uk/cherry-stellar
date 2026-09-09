import { execFileSync } from 'node:child_process';
import { readFile, writeFile, mkdir, cp, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const lock = JSON.parse(await readFile(resolve(root, 'base.lock.json'), 'utf8'));
const source = resolve(root, lock.path);
const destination = resolve(root, '.runtime/cherry-stellar');
try { await access(destination); throw new Error('Assembly already exists. Preserve its .env, database and uploads; use a fresh checkout for a new assembly.'); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
let actual;
try { actual = execFileSync('git', ['-C', source, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
catch { throw new Error('Initialise the private base first: git submodule update --init base/cherrymoney (Cherry Money access required).'); }
if (actual !== lock.commit) throw new Error('Base checkout does not match base.lock.json. Update the gitlink and lock together in a reviewed PR.');
if (execFileSync('git', ['-C', source, 'status', '--porcelain'], { encoding: 'utf8' }).trim()) throw new Error('Private base checkout has local changes. Commit or preserve them before assembly.');
await mkdir(destination, { recursive: true });
const archive = resolve(root, '.runtime/base.tar');
execFileSync('git', ['-C', source, 'archive', '--format=tar', '-o', archive, lock.commit]);
execFileSync('tar', ['-xf', archive, '-C', destination]);
await cp(resolve(root, 'extensions/cherrymoney/src'), resolve(destination, 'app/CherryStellar'), { recursive: true });
await cp(resolve(root, 'extensions/cherrymoney/migrations'), resolve(destination, 'database/migrations'), { recursive: true });
await cp(resolve(root, 'extensions/cherrymoney/config.php'), resolve(destination, 'config/cherry-stellar.php'));
const assets = resolve(destination, 'public/cherry-stellar');
await mkdir(assets, { recursive: true });
for (const file of ['app.js', 'style.css']) await cp(resolve(root, 'public', file), resolve(assets, file));
await cp(resolve(root, 'extensions/cherrymoney/adapter.js'), resolve(assets, 'adapter.js'));
await cp(resolve(root, 'node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js'), resolve(assets, 'stellar-sdk.js'));
let html = await readFile(resolve(root, 'public/index.html'), 'utf8');
html = html.replace('<head>', '<head><meta name="csrf-token" content="{{ csrf_token() }}">')
  .replaceAll('href="/style.css"', 'href="/cherry-stellar/style.css"')
  .replace('src="/stellar-sdk.js"', 'src="/cherry-stellar/stellar-sdk.js"')
  .replace('<script defer src="/app.js">', '<script defer src="/cherry-stellar/adapter.js"></script><script defer src="/cherry-stellar/app.js">')
  .replace('href="/" class="brand"', 'href="/home" class="brand"')
  .replace('<main>', '<main><p><a href="/home">← Cherry Money workspace</a></p>')
  .replace('Local demo records only', 'Company-scoped demo records · Cherry Money base');
await mkdir(resolve(destination, 'resources/views/cherry-stellar'), { recursive: true });
await writeFile(resolve(destination, 'resources/views/cherry-stellar/index.blade.php'), html);
const bootstrapPath = resolve(destination, 'bootstrap/app.php');
const bootstrap = await readFile(bootstrapPath, 'utf8');
if ((bootstrap.match(/return \$app;/g) || []).length !== 1) throw new Error('Upstream bootstrap changed; review the integration before proceeding.');
await writeFile(bootstrapPath, bootstrap.replace('return $app;', '$app->register(\\App\\CherryStellar\\StellarServiceProvider::class);\n\nreturn $app;'));
const menuPath = resolve(destination, 'resources/views/layout/menu.blade.php');
const menu = await readFile(menuPath, 'utf8');
const marker = '<ul class="sidebar-menu">';
if ((menu.split(marker).length - 1) !== 1) throw new Error('Upstream navigation changed; review the integration before proceeding.');
await writeFile(menuPath, menu.replace(marker, marker + '\n@if(config("cherry-stellar.enabled") && !$subscriptionExpired && $hasPurchasingPermission)\n<li><a class="navItem" href="{{ url("stellar") }}">Stellar payment lab</a></li>\n@endif'));
// Retain all other application source, dependencies, migrations, configuration and assets.
await writeFile(resolve(destination, 'CHERRY_STELLAR_BASE.json'), JSON.stringify(lock, null, 2));
console.log('Assembled full Cherry Money + Stellar extension in .runtime/cherry-stellar.');
console.log('Follow docs/cherrymoney-base.md to install dependencies and configure a separate database.');
