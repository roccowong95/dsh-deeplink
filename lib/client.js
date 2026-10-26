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
    zh: { copy: '复制 Deeplink', copied: 'Deeplink 已复制', failed: '无法复制 Deeplink，请重试' },
    en: { copy: 'Copy Deeplink', copied: 'Deeplink copied', failed: 'Could not copy Deeplink. Please try again.' },
  }));
  async function copy(sessionId) {
    if (disposed) return;
    const seq = ++sequence;
    let ok = false;
    try { ok = await writeClipboard(sessionDeeplink(sessionId)); } catch { /* Report rejected writes as failure too. */ }
    // An older pending write must not replace feedback for the latest click.
    if (!disposed && seq === sequence) publish({ seq, ok });
  }
  function CopyDeeplink({ sessionId, useMenuOpenState, t }) {
    const [, setMenuOpen] = useMenuOpenState();
    return React.createElement(MenuItemButton, {
      icon: React.createElement(IconCopyOutlineRegular),
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

return { name: 'deeplink-client', inject: ['connection', 'sessions', 'workspaces', 'uiWorkspace', 'layout', 'slots', 'locale'], apply(ctx) { installSessionMenu(ctx, require('react'), require('@deepseek-ai/dsh-client-ui-primitives')); if (window.location?.protocol !== 'dsh-app:' || window.location?.hostname !== 'app' || window.dshDesktop?.protocolVersion !== 1 || typeof window.dshDesktop?.deviceInfo !== 'function') return; ctx.effect(() => runClient(ctx)); } };
} });
