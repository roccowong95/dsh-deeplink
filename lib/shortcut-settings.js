const SHORTCUT_SETTINGS_LOCALE = 'dsh-deeplink-shortcut-settings';

/** Read-only effective binding in the official plugin detail, not a second recorder. */
export function installShortcutSettings(ctx, React, { ShortcutKeys }) {
  ctx.effect(() => ctx.locale.register(SHORTCUT_SETTINGS_LOCALE, {
    zh: {
      title: '快捷键', copy: '复制当前会话 Deeplink', unbound: '未绑定', unavailable: '快捷键暂不可用',
      help: '此处展示当前快捷键。可在 DSH 的「设置 → 通用 → 快捷键」中修改。',
      target: '快捷键复制当前查看的会话；会话菜单仍复制该行的会话。链接不包含 instance。',
      conflict: '此快捷键存在冲突或不可用，请在 DSH 快捷键设置中检查。',
    },
    en: {
      title: 'Keyboard shortcut', copy: 'Copy current session Deeplink', unbound: 'Unbound', unavailable: 'Shortcut unavailable',
      help: 'The effective shortcut is shown here. Change it in DSH Settings → General → Keyboard shortcuts.',
      target: 'The shortcut copies the viewed session; the session menu still copies its own row. Links never include instance.',
      conflict: 'This binding conflicts or is unavailable. Check DSH keyboard shortcut settings.',
    },
  }));
  function ShortcutSettings({ useCatalog, t }) {
    const command = useCatalog(rows => rows.find(row => row.id === 'dsh-deeplink.copy-current-session'));
    return React.createElement('section', { 'aria-label': t('title'), style: { minWidth: 0 } },
      React.createElement('h3', null, t('title')),
      React.createElement('div', { style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '8px 16px' } },
        React.createElement('span', null, t('copy')),
        React.createElement('span', { 'aria-label': command?.aria },
          command?.keys.length ? React.createElement(ShortcutKeys, { keys: command.keys })
            : t(command ? 'unbound' : 'unavailable'))),
      command && (command.issue || command.conflicts.length > 0)
        ? React.createElement('p', { role: 'status' }, t('conflict')) : null,
      React.createElement('p', null, t('help')),
      React.createElement('p', null, t('target')));
  }
  ctx.slots.inject('plugins.bundle.config', () => ctx.slots.register({
    name: 'plugins.bundle.config', key: 'dsh-deeplink', id: 'dsh-deeplink.shortcut-settings',
    locale: SHORTCUT_SETTINGS_LOCALE,
    inject: () => ({ hooks: { catalog: ctx.shortcuts.catalog } }),
  }, ShortcutSettings));
}
