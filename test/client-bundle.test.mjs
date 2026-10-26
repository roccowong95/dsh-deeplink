import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { menuHarness } from './helpers/menu-harness.mjs';
async function load(window, h) {
  let module;
  runInNewContext(await readFile(new URL('../lib/client.js', import.meta.url), 'utf8'), {
    window: { ...window, __ModuleLoader__: { load: value => module = value } },
  });
  assert.equal(module.id, 'dsh-deeplink');
  return module.factory(name => {
    if (name === 'react') return h.React;
    if (name === '@deepseek-ai/dsh-client-ui-primitives') return h.primitives;
    throw new Error(`unexpected dependency ${name}`);
  });
}
test('shipped client composes menu for Desktop plus guarded polling lifecycle', async () => {
  const h = menuHarness();
  const plugin = await load({ location: { protocol: 'dsh-app:', hostname: 'app' }, dshDesktop: { protocolVersion: 1, deviceInfo() {} } }, h);
  assert.deepEqual([...plugin.inject], ['connection', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'slots', 'locale']);
  let effects = 0;
  plugin.apply({ ...h.ctx, effect(fn) { effects++; /* Do not start navigation in this bundle wiring test. */ } });
  assert.equal(effects, 3); assert.equal(h.entries.size, 2); h.dispose();
});
test('ordinary browser registers copy menu without polling or RPC', async () => {
  const h = menuHarness(); const plugin = await load({ location: { protocol: 'https:', hostname: 'localhost' } }, h);
  plugin.apply(h.ctx); assert.equal(h.entries.size, 2);
  h.item('browser-row').props.onSelect(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.notice().props.tone, 'success'); h.dispose();
});
