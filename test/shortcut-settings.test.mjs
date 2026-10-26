import test from 'node:test';
import assert from 'node:assert/strict';
import { installShortcutSettings } from '../lib/shortcut-settings.js';

test('official bundle detail shows effective keycaps and follows rebinding, clearing and conflicts', () => {
  let entry, dictionary, rows = [];
  const effects = [], slots = [];
  const catalog = { getSnapshot: () => rows };
  const ctx = {
    shortcuts: { catalog },
    effect(fn) { effects.push(fn()); },
    locale: { register(ns, values) { dictionary = values.en; return () => { dictionary = null; }; } },
    slots: {
      inject(name, fn) { slots.push(fn()); },
      register(options, component) { entry = { options, component }; return () => { entry = null; }; },
    },
  };
  const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
  installShortcutSettings(ctx, React, { ShortcutKeys: 'official-keycaps' });
  assert.equal(entry.options.name, 'plugins.bundle.config');
  assert.equal(entry.options.key, 'dsh-deeplink');
  assert.equal(entry.options.inject().hooks.catalog, catalog);
  const render = () => entry.component({ useCatalog: selector => selector(catalog.getSnapshot()), t: key => dictionary[key] });
  assert.equal(render().children[1].children[1].children[0], 'Shortcut unavailable');
  rows = [{ id: 'dsh-deeplink.copy-current-session', keys: ['⌘', '⇧', 'C'], aria: 'Meta+Shift+C', issue: null, conflicts: [] }];
  let view = render();
  assert.equal(view.children[1].children[1].children[0].type, 'official-keycaps');
  assert.deepEqual(view.children[1].children[1].children[0].props.keys, rows[0].keys);
  assert.equal(view.children[1].children[1].props['aria-label'], 'Meta+Shift+C');
  rows = [{ ...rows[0], keys: ['⌘', '⇧', 'L'], aria: 'Meta+Shift+L' }];
  assert.deepEqual(render().children[1].children[1].children[0].props.keys, rows[0].keys);
  rows = [{ ...rows[0], conflicts: ['another.command'] }];
  assert.equal(render().children[2].props.role, 'status');
  rows = [{ ...rows[0], keys: [], aria: undefined, conflicts: [] }];
  assert.equal(render().children[1].children[1].children[0], 'Unbound');
  for (const dispose of [...slots, ...effects]) dispose();
  assert.equal(entry, null);
  assert.equal(dictionary, null);
});
