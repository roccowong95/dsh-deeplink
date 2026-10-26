window.__ModuleLoader__.load({ id: 'dsh-deeplink', factory: (require) => {
function cancellable(promise, signal) {
  signal.throwIfAborted();
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    Promise.resolve(promise).then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}
/** Navigation only. No creation, unarchive, prompts, tools, or session mutation. */
async function openRequest(ctx, request, lifetime) {
  const initial = ctx.sessions.list.getSnapshot();
  if (initial.phase === 'ready' && !initial.ids.includes(request.sessionId)) throw new Error('session-not-found');
  if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(request.sessionId)) throw new Error('session-archived');
  const navigation = ctx.layout.beginNavigation();
  const deadline = AbortSignal.timeout(Math.max(1, request.deadline - Date.now()));
  const signal = AbortSignal.any([navigation, lifetime, deadline]);
  const check = () => {
    signal.throwIfAborted();
    const catalog = ctx.sessions.list.getSnapshot();
    if (!catalog.ids.includes(request.sessionId)) throw new Error('session-not-found');
    if (ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(request.sessionId)) throw new Error('session-archived');
    if (catalog.byId[request.sessionId]?.origin === 'subagent') throw new Error('subagent-link-not-supported');
  };
  await cancellable(ctx.sessions.refresh(), signal); check();
  const reference = ctx.sessions.retain(request.sessionId, { source: 'controllerOperation', signal });
  try {
    await cancellable(reference.ready, signal); check();
    ctx.uiWorkspace.openSession(request.sessionId);
    if (!(ctx.sessions.retainInfo(request.sessionId).getSnapshot().retainedBy.mainView > 0)
      || ctx.layout.panelInfo.getSnapshot().activePanelId !== null) throw new Error('navigation-not-selected');
    // Official mainView ownership and conversation panel confirm selection, not pixel rendering.
    return { status: 'opened', error: '' };
  } finally { reference.release(); }
}
function runClient(ctx, { interval = 750, onError = () => {} } = {}) {
  const lifetime = new AbortController(); let timer;
  const rpc = async (method, args) => {
    const result = await ctx.connection.rpc.call('/api', `deeplink/${method}`, { args }, lifetime.signal);
    if (!result.ok) throw new Error(result.error?.message ?? 'deeplink-rpc-failed');
    return result.value;
  };
  async function tick() {
    try {
      const request = await rpc('claim', {});
      if (request) {
        let outcome;
        try { outcome = await openRequest(ctx, request, lifetime.signal); }
        catch (error) { outcome = { status: error.name === 'AbortError' ? 'cancelled' : 'failed', error: error.message }; }
        if (!lifetime.signal.aborted) await rpc('ack', { requestId: request.requestId, ...outcome });
      }
    } catch (error) { if (!lifetime.signal.aborted) onError(error); }
    finally { if (!lifetime.signal.aborted) timer = setTimeout(tick, interval); }
  }
  tick();
  return () => { lifetime.abort(); clearTimeout(timer); };
}

const COPY_COMMAND = 'dsh-deeplink.copy-current-session';

/** Only macOS Desktop has a default: other shells retain their copy/inspector keys. */
const COPY_DEFAULTS = { 'desktop:macos': { code: 'KeyC', modifiers: ['meta', 'shift'] } };

/** Resolve the viewed conversation, not the hovered/context-menu row. */
function installCopyShortcut(ctx, copy) {
  const t = ctx.locale.bind('dsh-deeplink');
  ctx.effect(() => ctx.shortcuts.register({
    id: COPY_COMMAND,
    label: () => t('copyCurrent'),
    aliases: ['copy deeplink', 'copy current session link'],
    defaults: COPY_DEFAULTS,
    regions: ['page', 'editable'],
    modals: [],
    resolve(context) {
      const target = Object.values(ctx.sessions.list.getSnapshot().byId)
        .find(row => (row.retainedBy?.mainView ?? 0) > 0);
      if (!target || target.blank || target.origin === 'subagent' || context.modal !== null
        || ctx.layout.panelInfo.getSnapshot().activePanelId !== null
        || ctx.workspaces.list.getSnapshot().archivedSessionIds.includes(target.id)) {
        return { status: 'blocked', reason: t('noSession') };
      }
      // Capture the identity synchronously, just like the official workspace commands.
      return { status: 'handled', run: () => { void copy(target.id); } };
    },
  }));
}

const MENU_SLOT = 'sidebar.workspaces.session.menu.item';
const LOCALE = 'dsh-deeplink';

/** The row's identity is the only input; links never bind to an instance. */
function sessionDeeplink(sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw new Error('missing-session-id');
  return `dsh-link://session/${encodeURIComponent(sessionId)}`;
}

/** Official slot contributions, owned by the plugin's Cordis lifetime. */
function installSessionMenu(ctx, React, { MenuItemButton, IconCopyOutlineRegular, Toast, writeClipboard }) {
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

const SHORTCUT_SETTINGS_LOCALE = 'dsh-deeplink-shortcut-settings';

/** Read-only effective binding in the official plugin detail, not a second recorder. */
function installShortcutSettings(ctx, React, { ShortcutKeys }) {
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

return { name: 'deeplink-client', inject: ['connection', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'slots', 'locale', 'shortcuts'], apply(ctx) { installSessionMenu(ctx, require('react'), require('@deepseek-ai/dsh-client-ui-primitives')); installShortcutSettings(ctx, require('react'), require('@deepseek-ai/dsh-client-ui-primitives')); if (window.location?.protocol !== 'dsh-app:' || window.location?.hostname !== 'app' || window.dshDesktop?.protocolVersion !== 1 || typeof window.dshDesktop?.deviceInfo !== 'function') return; ctx.effect(() => runClient(ctx)); } };
} });
