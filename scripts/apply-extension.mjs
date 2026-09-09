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
  await cp(resolve(root, 'public/app.js'), resolve(assets, 'app.js'));
  await cp(resolve(root, 'extensions/cherrymoney/style.css'), resolve(assets, 'style.css'));
  await cp(resolve(root, 'extensions/cherrymoney/adapter.js'), resolve(assets, 'adapter.js'));
  await cp(resolve(root, 'node_modules/@stellar/stellar-sdk/dist/stellar-sdk.min.js'), resolve(assets, 'stellar-sdk.js'));
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  const content = [...html.matchAll(/<main>([\s\S]*?)<\/main>/g)];
  if (content.length !== 1) throw new Error('Stellar workspace markup changed; review the shared layout integration.');
  const workspace = content[0][1]
    .replace('Standalone payment lab · Local demo records only', 'Cherry Pay · Company-scoped demo records');
  await mkdir(resolve(destination, 'resources/views/cherry-stellar'), { recursive: true });
  await cp(resolve(root, 'extensions/cherrymoney/views'), resolve(destination, 'resources/views/cherry-stellar'), { recursive: true });
  await writeFile(resolve(destination, 'resources/views/cherry-stellar/content.blade.php'), workspace);
  const bootstrapPath = resolve(destination, 'bootstrap/app.php');
  const bootstrap = await readFile(bootstrapPath, 'utf8');
  if ((bootstrap.match(/return \$app;/g) || []).length !== 1) throw new Error('Upstream bootstrap changed; review the integration before proceeding.');
  await writeFile(bootstrapPath, bootstrap.replace('return $app;', '$app->register(\\App\\CherryStellar\\StellarServiceProvider::class);\n\nreturn $app;'));
  const menuPath = resolve(destination, 'resources/views/layout/menu.blade.php');
  const menu = await readFile(menuPath, 'utf8');
  // Replace only Cherry Pay's existing entry. Keep its original behaviour when
  // Stellar is unavailable, including access for users with sales permissions.
  const cherryPayEntry = /@if\(\$hasSalesPermission\)\s*<li\b[^>]*>\s*<a\b[^>]*href="\{\{\s*Asset\('dashboard\/cherry-pay'\)\s*\}\}"[^>]*>[\s\S]*?<\/a>\s*<\/li>\s*@endif/g;
  if ([...menu.matchAll(cherryPayEntry)].length !== 1) throw new Error('Upstream Cherry Pay navigation changed; review the integration before proceeding.');
  await writeFile(menuPath, menu.replace(cherryPayEntry, original =>
    '@if(config("cherry-stellar.enabled") && !$subscriptionExpired && $hasPurchasingPermission)\n' +
    '@include("cherry-stellar.navigation")\n@else\n' + original + '\n@endif'));
  
  await writeFile(resolve(destination, 'CHERRY_STELLAR_BASE.json'), JSON.stringify(metadata, null, 2));
}
