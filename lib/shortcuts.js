export const COPY_COMMAND = 'dsh-deeplink.copy-current-session';

/** Only macOS Desktop has a default: other shells retain their copy/inspector keys. */
export const COPY_DEFAULTS = { 'desktop:macos': { code: 'KeyC', modifiers: ['meta', 'shift'] } };

/** Resolve the viewed conversation, not the hovered/context-menu row. */
export function installCopyShortcut(ctx, copy) {
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
