import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const lock = JSON.parse(await readFile('base.lock.json', 'utf8'));
assert.equal(lock.repository, 'sohamtech-uk/cherrymoney');
const entry = execFileSync('git', ['ls-files', '--stage', '--', lock.path], { encoding: 'utf8' }).trim();
assert.equal(entry, `160000 ${lock.commit} 0\t${lock.path}`, 'Private base gitlink and lockfile must match.');
console.log('Private Cherry Money base pointer verified without fetching private source.');
