import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY_COMMAND, COPY_DEFAULTS } from '../lib/shortcuts.js';
import { menuHarness } from './helpers/menu-harness.mjs';
const flush = () => new Promise(resolve => setImmediate(resolve));
function harness() {
  const writes = [];
  const h = menuHarness(async text => { writes.push(text); return true; });
  let rows = { a: { id: 'viewed', retainedBy: { mainView: 1 } } };
  h.ctx.sessions.list.getSnapshot = () => ({ byId: rows });
  h.mount();
  return { ...h, writes, rows: value => { rows = value; }, command: () => h.commands.get(COPY_COMMAND) };
}
test('macOS default only; uses official registry input ownership and disposal', () => {
  const h = harness(); const c = h.command();
  assert.deepEqual(c.defaults, { 'desktop:macos': { code: 'KeyC', modifiers: ['meta', 'shift'] } });
  assert.deepEqual(c.regions, ['page', 'editable']); assert.deepEqual(c.modals, []);
  assert.equal(c.label(), '复制当前会话 Deeplink');
  h.dispose(); assert.equal(h.commands.size, 0); h.mount(); assert.equal(h.commands.size, 1); h.dispose();
});
test('shortcut captures viewed session, while row menu remains row-specific', async () => {
  const h = harness();
  const action = h.command().resolve({ modal: null });
  h.rows({ b: { id: 'new-view', retainedBy: { mainView: 1 } } });
  action.run(); await flush(); h.item('hovered-row').props.onSelect(); await flush();
  h.command().resolve({ modal: null }).run(); await flush();
  assert.deepEqual(h.writes, ['dsh-link://session/viewed', 'dsh-link://session/hovered-row', 'dsh-link://session/new-view']);
  h.dispose();
});
test('no session, blank, subagent, archived, global panel and modal are harmless blocked commands', () => {
  const h = harness();
  for (const rows of [{}, { a: { id: 'a', retainedBy: {} } }, ...['blank', 'origin'].map(key => ({ a: { id: 'a', retainedBy: { mainView: 1 }, [key]: key === 'blank' ? true : 'subagent' } }))]) {
    h.rows(rows); assert.equal(h.command().resolve({ modal: null }).status, 'blocked');
  }
  h.rows({ a: { id: 'a', retainedBy: { mainView: 1 } } });
  assert.equal(h.command().resolve({ modal: 'settings' }).status, 'blocked');
  h.ctx.workspaces.list.getSnapshot = () => ({ archivedSessionIds: ['a'] });
  assert.equal(h.command().resolve({ modal: null }).status, 'blocked');
  h.ctx.workspaces.list.getSnapshot = () => ({ archivedSessionIds: [] });
  h.ctx.layout.panelInfo.getSnapshot = () => ({ activePanelId: 'plugins' });
  assert.equal(h.command().resolve({ modal: null }).status, 'blocked');
  assert.deepEqual(h.writes, []); h.dispose();
});
test('menu delegates effective keycaps and ARIA to official primitive after rebind/unbind', () => {
  const h = harness();
  for (const binding of [{ keys: ['⇧', '⌘', 'C'], aria: 'Shift+Meta+C' }, { keys: ['⌥', 'K'], aria: 'Alt+K', modified: true }, { keys: [], aria: undefined, binding: null }]) {
    const row = { id: COPY_COMMAND, ...binding }; h.setCatalog([row]);
    assert.equal(h.item('row').props.shortcut, row);
  }
  h.dispose();
});
test('captured action after unload never copies or publishes a toast', async () => {
  const h = harness(); const action = h.command().resolve({ modal: null });
  h.dispose(); action.run(); await flush(); assert.deepEqual(h.writes, []);
});
