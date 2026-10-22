import { readFile, writeFile } from 'node:fs/promises';
const source = await readFile(new URL('../lib/navigation.js', import.meta.url), 'utf8');
const code = `window.__ModuleLoader__.load({ id: 'dsh-deeplink', factory: () => {\n${source.replaceAll('export ', '')}\nreturn { name: 'deeplink-client', inject: ['connection', 'sessions', 'workspaces', 'uiWorkspace', 'layout'], apply(ctx) { if (window.location?.protocol !== 'dsh-app:' || window.location?.hostname !== 'app' || window.dshDesktop?.protocolVersion !== 1 || typeof window.dshDesktop?.deviceInfo !== 'function') return; ctx.effect(() => runClient(ctx)); } };\n} });\n`;
await writeFile(new URL('../lib/client.js', import.meta.url), code);
