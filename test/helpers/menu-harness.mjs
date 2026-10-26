import assert from 'node:assert/strict';
import { installSessionMenu } from '../../lib/session-menu.js';

export function menuHarness(writeClipboard = async () => true) {
  const entries = new Map();
  const effects = [];
  const waits = [];
  const dictionaries = new Map();
  const ctx = {
    effect(fn) { const dispose = fn(); effects.push(dispose); },
    locale: { register(ns, value) { dictionaries.set(ns, value); return () => dictionaries.delete(ns); } },
    slots: {
      inject(name, callback) { const wait = { name, callback, dispose: callback() }; waits.push(wait); return () => wait.dispose(); },
      register(options, component) {
        assert.equal(entries.has(options.id), false, 'duplicate menu contribution');
        entries.set(options.id, { options, component });
        return () => entries.delete(options.id);
      },
    },
  };
  const React = { createElement: (type, props, ...children) => ({ type, props, children }) };
  const primitives = { MenuItemButton: 'menu-button', IconCopyOutlineRegular: 'copy-icon', Toast: 'toast', writeClipboard };
  const t = key => dictionaries.get('dsh-deeplink').zh[key];
  const item = sessionId => entries.get('dsh-deeplink.copy-session-link').component({ sessionId, useMenuOpenState: () => [true, value => closed.push(value)], t });
  const closed = [];
  const source = () => entries.get('dsh-deeplink.copy-notice').options.inject().hooks.notice;
  return {
    ctx, React, primitives, entries, closed, item, source,
    mount: () => installSessionMenu(ctx, React, primitives),
    notice: () => entries.get('dsh-deeplink.copy-notice').component({ useNotice: selector => { assert.equal(typeof selector, 'function'); return selector(source().getSnapshot()); }, t }),
    cycleSlots() { for (const wait of waits) { wait.dispose(); wait.dispose = wait.callback(); } },
    dispose() { for (const wait of waits.splice(0)) wait.dispose(); for (const effect of effects.splice(0).reverse()) effect?.(); },
  };
}
