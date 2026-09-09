import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';

test('full-base assembly preserves existing modules, pins source and refuses overwrites', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cherry-base-'));
  const source = join(root, 'base/cherrymoney');
  const run = (command, args, cwd = root) => execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  try {
    for (const path of ['bootstrap', 'app', 'resources/views/layout', 'database/migrations', 'config']) await mkdir(join(source, path), { recursive: true });
    await writeFile(join(source, 'bootstrap/app.php'), '<?php\n$app = new ExampleApplication;\nreturn $app;\n');
    await writeFile(join(source, 'resources/views/layout/menu.blade.php'), '<ul class="sidebar-menu"><li>Existing navigation</li></ul>');
    await writeFile(join(source, 'app/ExistingFeature.php'), '<?php // synthetic existing feature; preserve exactly\n');
    run('git', ['init', '-q'], source); run('git', ['add', '.'], source);
    run('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Synthetic base'], source);
    const sha = run('git', ['rev-parse', 'HEAD'], source).trim();
    await writeFile(join(root, 'base.lock.json'), JSON.stringify({ path: 'base/cherrymoney', commit: sha }));
    await mkdir(join(root, 'scripts'));
    await cp(new URL('../scripts/assemble-base.mjs', import.meta.url), join(root, 'scripts/assemble-base.mjs'));
    await cp(new URL('../scripts/apply-extension.mjs', import.meta.url), join(root, 'scripts/apply-extension.mjs'));
    await cp(new URL('../extensions', import.meta.url), join(root, 'extensions'), { recursive: true });
    await cp(new URL('../public', import.meta.url), join(root, 'public'), { recursive: true });
    const bundle = 'node_modules/@stellar/stellar-sdk/dist'; await mkdir(join(root, bundle), { recursive: true });
    await writeFile(join(root, bundle, 'stellar-sdk.min.js'), '// synthetic test asset');
    run(process.execPath, ['scripts/assemble-base.mjs']);
    const runtime = join(root, '.runtime/cherry-stellar');
    assert.equal(await readFile(join(runtime, 'app/ExistingFeature.php'), 'utf8'), await readFile(join(source, 'app/ExistingFeature.php'), 'utf8'));
    assert.equal(run('git', ['status', '--porcelain'], source), '');
    assert.match(await readFile(join(runtime, 'bootstrap/app.php'), 'utf8'), /StellarServiceProvider/);
    const page = await readFile(join(runtime, 'resources/views/cherry-stellar/index.blade.php'), 'utf8');
    assert.match(page, /csrf_token/); assert.match(page, /cherry-stellar\/adapter.js/); assert.doesNotMatch(page, /src="\/app.js"/);
    await writeFile(join(runtime, '.env'), 'SYNTHETIC_SETTING=keep');
    assert.throws(() => run(process.execPath, ['scripts/assemble-base.mjs']), /Assembly already exists/);
    assert.equal(await readFile(join(runtime, '.env'), 'utf8'), 'SYNTHETIC_SETTING=keep');
  } finally { await rm(root, { recursive: true, force: true }); }
});
