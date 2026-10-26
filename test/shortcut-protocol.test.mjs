// Exercise official rc.2 protocol/persistence, with isolated in-memory preferences.
import test from 'node:test';
import assert from 'node:assert/strict';
import { COPY_COMMAND, COPY_DEFAULTS } from '../lib/shortcuts.js';
import { parseShortcutDefinitions, effectiveShortcuts, ShortcutPersistence, normalizeBinding, bindingIssue } from '@deepseek-ai/dsh-client-shortcuts/protocol';
const definitions = [{ id: COPY_COMMAND, defaults: COPY_DEFAULTS }];
test('official rc.2 accepts macOS default, rejects overlapping defaults and reserves Linux copy keys', () => {
  assert.equal(parseShortcutDefinitions(definitions).length, 1);
  assert.equal(bindingIssue(normalizeBinding(COPY_DEFAULTS['desktop:macos'], 'macos'), 'desktop', 'macos'), null);
  assert.equal(bindingIssue(normalizeBinding({ code: 'KeyC', modifiers: ['control', 'shift'] }, 'linux'), 'web', 'linux'), 'reserved');
  assert.throws(() => parseShortcutDefinitions([...definitions, { id: 'other', defaults: COPY_DEFAULTS }]));
});
test('official persistence rebinds across reload, rejects conflicting/stale edits and preserves failed writes', async () => {
  let raw = null; let fail = false;
  const storage = { read: () => raw, write: value => { if (fail) throw Error('write failed'); raw = value; } };
  const defs = [...definitions, { id: 'other', defaults: { 'desktop:macos': { code: 'KeyK', modifiers: ['meta', 'alt'] } } }];
  const owner = () => { const p = new ShortcutPersistence(storage, 'desktop', 'macos', false, () => {}); p.setDefinitions(defs); return p; };
  const p = owner(); let snapshot = await p.readCurrent();
  const oldRevision = snapshot.revision;
  let result = await p.edit({ type: 'set', id: COPY_COMMAND, binding: { code: 'KeyJ', modifiers: ['meta', 'alt'] } }, snapshot.revision);
  assert.equal(result.status, 'saved'); snapshot = result.snapshot;
  const saved = raw;
  assert.equal((await p.edit({ type: 'reset', id: COPY_COMMAND }, oldRevision)).status, 'stale');
  result = await p.edit({ type: 'set', id: COPY_COMMAND, binding: { code: 'KeyK', modifiers: ['meta', 'alt'] } }, snapshot.revision);
  assert.equal(result.status, 'conflict'); assert.equal(raw, saved);
  fail = true; assert.equal((await p.edit({ type: 'reset', id: COPY_COMMAND }, snapshot.revision)).status, 'write-failed'); assert.equal(raw, saved); fail = false;
  p.dispose(); const restarted = owner(); snapshot = await restarted.readCurrent();
  const row = effectiveShortcuts(defs, snapshot.document, 'desktop', 'macos').find(row => row.id === COPY_COMMAND);
  assert.equal(row.binding.code, 'KeyJ'); assert.equal(row.modified, true);
  result = await restarted.edit({ type: 'set', id: COPY_COMMAND, binding: null }, snapshot.revision);
  assert.equal(result.status, 'saved'); assert.equal(effectiveShortcuts(defs, result.snapshot.document, 'desktop', 'macos')[0].binding, null);
  result = await restarted.edit({ type: 'reset', id: COPY_COMMAND }, result.snapshot.revision);
  assert.equal(result.status, 'saved'); assert.equal(effectiveShortcuts(defs, result.snapshot.document, 'desktop', 'macos')[0].binding.code, 'KeyC');
  restarted.dispose();
});
