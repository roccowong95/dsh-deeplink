import { COPY_COMMAND, installCopyShortcut } from './shortcuts.js';
const MENU_SLOT = 'sidebar.workspaces.session.menu.item';
const LOCALE = 'dsh-deeplink';

/** The row's identity is the only input; links never bind to an instance. */
export function sessionDeeplink(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('missing-session-id');
  return `dsh-link://session/${encodeURIComponent(sessionId)}`;
}

/** Official slot contributions, owned by the plugin's Cordis lifetime. */
export function installSessionMenu(ctx, React, { MenuItemButton, IconCopyOutlineRegular, Toast, writeClipboard }) {
  let disposed = false;
  let notice = null;
  let sequence = 0;
  const listeners = new Set();
  const publish = value => {
    if (disposed) return;
    notice = value;
    for (const listener of listeners) listener();
  };
  const source = {
    getSnapshot: () => notice,
    subscribe: listener => { listeners.add(listener); return () => listeners.delete(listener); },
  };
  ctx.effect(() => () => { disposed = true; notice = null; listeners.clear(); });
  ctx.effect(() => ctx.locale.register(LOCALE, {
    zh: { copyCurrent: '复制当前会话 Deeplink', noSession: '当前没有可复制链接的会话', copy: '复制 Deeplink', copied: 'Deeplink 已复制', failed: '无法复制 Deeplink，请重试' },
    en: { copyCurrent: 'Copy Current Session Deeplink', noSession: 'No current session to copy', copy: 'Copy Deeplink', copied: 'Deeplink copied', failed: 'Could not copy Deeplink. Please try again.' },
  }));
  async function copy(sessionId) {
    if (disposed) return;
    const seq = ++sequence;
    let ok = false;
    try { ok = await writeClipboard(sessionDeeplink(sessionId)); } catch { /* Report rejected writes as failure too. */ }
    // An older pending write must not replace feedback for the latest click.
    if (!disposed && seq === sequence) publish({ seq, ok });
  }
  installCopyShortcut(ctx, copy);
  function CopyDeeplink({ sessionId, useMenuOpenState, useShortcuts, t }) {
    const shortcut = useShortcuts(rows => rows.find(row => row.id === COPY_COMMAND));
    const [, setMenuOpen] = useMenuOpenState();
    return React.createElement(MenuItemButton, {
      icon: React.createElement(IconCopyOutlineRegular),
      shortcut,
      onSelect: () => { setMenuOpen(false); void copy(sessionId); },
    }, t('copy'));
  }
  function CopyNotice({ useNotice, t }) {
    const value = useNotice(value => value);
    return value ? React.createElement(Toast, {
      key: value.seq,
      text: t(value.ok ? 'copied' : 'failed'),
      tone: value.ok ? 'success' : undefined,
      onDone: () => { if (notice?.seq === value.seq) publish(null); },
    }) : null;
  }
  ctx.slots.inject(MENU_SLOT, () => ctx.slots.register({
    name: MENU_SLOT, id: 'dsh-deeplink.copy-session-link', order: 460, locale: LOCALE,
  }, CopyDeeplink));
  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay', id: 'dsh-deeplink.copy-notice', locale: LOCALE,
    inject: () => ({ hooks: { notice: source } }),
  }, CopyNotice));
}
