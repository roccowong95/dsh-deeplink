import test from 'node:test';
import assert from 'node:assert/strict';
import { sessionDeeplink } from '../lib/session-menu.js';

import { menuHarness } from './helpers/menu-harness.mjs';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('links contain only the encoded row ID, never query parameters', () => {
  assert.equal(sessionDeeplink('session-123'), 'dsh-link://session/session-123');
  assert.equal(sessionDeeplink('id?instance=x/#你好'), 'dsh-link://session/id%3Finstance%3Dx%2F%23%E4%BD%A0%E5%A5%BD');
  assert.throws(() => sessionDeeplink(''));
});

test('official menu slot follows Copy Session ID and copies clicked row without session operations', async () => {
  const writes = [];
  const h = menuHarness(async text => { writes.push(text); return true; }); h.mount();
  const entry = h.entries.get('dsh-deeplink.copy-session-link');
  assert.equal(entry.options.name, 'sidebar.workspaces.session.menu.item');
  assert.equal(entry.options.order, 460);
  const item = h.item('other-row'); assert.equal(item.type, 'menu-button'); assert.equal(item.children[0], '复制 Deeplink');
  item.props.onSelect(); assert.deepEqual(h.closed, [false]); await flush();
  assert.deepEqual(writes, ['dsh-link://session/other-row']);
  assert.equal(h.notice().props.text, 'Deeplink 已复制'); assert.equal(h.notice().props.tone, 'success');
  h.dispose();
});

for (const failure of [async () => false, async () => { throw new Error('denied'); }]) {
  test('clipboard failure is visible and retry works', async () => {
    let attempt = 0;
    const h = menuHarness(text => ++attempt === 1 ? failure(text) : Promise.resolve(true)); h.mount();
    h.item('row').props.onSelect(); await flush(); assert.equal(h.notice().props.text, '无法复制 Deeplink，请重试');
    assert.equal(h.notice().props.tone, undefined);
    h.item('row').props.onSelect(); await flush(); assert.equal(h.notice().props.tone, 'success');
    h.notice().props.onDone(); assert.equal(h.notice(), null); h.dispose();
  });
}

test('repeated clicks have fresh feedback; stale completion/dismissal cannot hide latest result', async () => {
  const resolves = [];
  const h = menuHarness(() => new Promise(resolve => resolves.push(resolve))); h.mount();
  h.item('a').props.onSelect(); h.item('b').props.onSelect();
  resolves[1](true); await flush(); const latest = h.notice();
  resolves[0](false); await flush(); assert.equal(h.notice().props.key, latest.props.key);
  h.item('c').props.onSelect(); resolves[2](true); await flush();
  assert.notEqual(h.notice().props.key, latest.props.key);
  latest.props.onDone(); assert.notEqual(h.notice(), null); h.dispose();
});

test('slot redeclaration and plugin reload stay duplicate-free; unload ignores pending clipboard', async () => {
  let resolve;
  const h = menuHarness(() => new Promise(done => resolve = done)); h.mount(); h.cycleSlots();
  assert.equal(h.entries.size, 2);
  const source = h.source(); let updates = 0; source.subscribe(() => updates++);
  const oldItem = h.item('row'); oldItem.props.onSelect(); h.dispose();
  assert.equal(h.entries.size, 0); resolve(true); await flush(); assert.equal(updates, 0); assert.equal(source.getSnapshot(), null);
  h.mount(); assert.equal(h.entries.size, 2); h.dispose();
});
