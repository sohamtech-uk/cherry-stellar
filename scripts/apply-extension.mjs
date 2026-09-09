import { readFile, writeFile, mkdir, cp } from 'node:fs/promises';
import { resolve } from 'node:path';

// Add the same extension to an archived checkout or a private container image.
export async function applyExtension(root, destination, metadata) {
  for (const path of ['app', 'database/migrations', 'config']) await mkdir(resolve(destination, path), { recursive: true });
  const existingBootstrap = await readFile(resolve(destination, 'bootstrap/app.php'), 'utf8');
  if (existingBootstrap.includes('CherryStellar')) throw new Error('The base already contains Stellar; use the original base image/check-out.');
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
  
  await writeFile(resolve(destination, 'CHERRY_STELLAR_BASE.json'), JSON.stringify(metadata, null, 2));
}

