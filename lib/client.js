window.__ModuleLoader__.load({ id: 'dsh-deeplink', factory: () => {
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

return { name: 'deeplink-client', inject: ['connection', 'sessions', 'workspaces', 'uiWorkspace', 'layout'], apply(ctx) { if (window.location?.protocol !== 'dsh-app:' || window.location?.hostname !== 'app' || window.dshDesktop?.protocolVersion !== 1 || typeof window.dshDesktop?.deviceInfo !== 'function') return; ctx.effect(() => runClient(ctx)); } };
} });
