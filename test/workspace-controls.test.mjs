import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { runInContext, createContext } from 'node:vm';

test('Stellar loading preserves shared header controls and the existing jQuery binding', async () => {
  const source = await readFile(new URL('../public/app.js', import.meta.url), 'utf8');
  for (const embedded of [true, false]) {
    const nodes = new Map();
    const node = id => {
      if (!nodes.has(id)) nodes.set(id, { disabled: false, replaceChildren() {} });
      return nodes.get(id);
    };
    const buttons = ['pay', 'check', 'refresh', 'submit'].map(node);
    const headerButtons = [{ disabled: false }, { disabled: true }];
    const workspace = {
      querySelector: selector => node(selector.slice(1)),
      querySelectorAll: selector => selector === 'button' ? buttons : [],
    };
    const jquery = () => 'existing jQuery';
    let pending;
    const context = createContext({
      document: {
        getElementById: id => id === 'cherry-stellar' ? (embedded ? workspace : null) : node(id),
        querySelector: selector => selector === 'main' ? workspace : null,
        querySelectorAll: () => [...buttons, ...headerButtons],
      },
      window: { CherryApi: async () => pending ? await pending : [] },
      navigator: { locks: { request: async (_name, callback) => callback() } },
      crypto: { randomUUID }, jquery,
    });
    runInContext('var $ = jquery;', context);
    runInContext(source, context);
    await new Promise(setImmediate);
    assert.deepEqual(headerButtons.map(b => b.disabled), [false, true]);
    assert.equal(runInContext('$', context), jquery);
    let release;
    pending = new Promise(resolve => { release = resolve; });
    node('refresh').onclick();
    assert.ok(buttons.every(b => b.disabled));
    assert.deepEqual(headerButtons.map(b => b.disabled), [false, true]);
    release([]);
    await new Promise(setImmediate);
    assert.equal(node('refresh').disabled, false);
    assert.deepEqual(headerButtons.map(b => b.disabled), [false, true]);
    assert.equal(runInContext('$', context), jquery);
  }
});
