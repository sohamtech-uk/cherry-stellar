import { execFileSync } from 'node:child_process';
import { readFile, mkdir, access } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { applyExtension } from './apply-extension.mjs';

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
await applyExtension(root, destination, lock);
console.log('Assembled full Cherry Money + Stellar extension in .runtime/cherry-stellar.');
console.log('Follow docs/cherrymoney-base.md to install dependencies and configure a separate database.');
