// Run from an isolated consumer, using a separately installed rc.2 Host.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';

const [hostRoot, consumerRoot] = process.argv.slice(2);
const host = createRequire(join(hostRoot, 'package.json'));
const consumer = createRequire(join(consumerRoot, 'package.json'));
const pluginPath = consumer.resolve('dsh-deeplink');
const plugin = createRequire(pluginPath);
const load = path => import(pathToFileURL(path));
const { Context } = await load(host.resolve('@deepseek-ai/cordis'));
const { Context: PluginContext } = await load(plugin.resolve('@deepseek-ai/cordis'));
const { TypertRegistry } = await load(host.resolve('@deepseek-ai/dsh-typert-registry'));
const { TypertGatewayService } = await load(host.resolve('@deepseek-ai/dsh-api-gateway'));
const { DeeplinkService } = await load(pluginPath);
const { RequestQueue } = await import(new URL('./bridge.js', pathToFileURL(pluginPath)));
// A shared development node_modules tree must not mask cross-copy compatibility.
assert.notEqual(Context, PluginContext);
const ctx = new Context();
assert.equal(PluginContext.is(ctx), true);
new TypertRegistry(ctx);
ctx.provide('remoteAccess', { decide: () => ({ kind: 'allow' }) });
const gateway = new TypertGatewayService(ctx, { websocketHeartbeatIntervalMs: 2000, streamInboxBytes: 262144 });
const queue = new RequestQueue();
new DeeplinkService(ctx, queue);
const id = randomUUID();
queue.enqueue(id, 'installed-session');
const peer = { id: 'installed-owner', ctx, principal: { kind: 'owner' }, signal: new AbortController().signal, interactions: 'answer' };
const invoke = (method, args, caller = peer) => gateway.invoke({ namespace: 'deeplink', method, args, peer: caller });
assert.equal((await invoke('claim', {})).requestId, id);
assert.equal((await invoke('ack', { requestId: id, status: 'opened', error: '' })).status, 'opened');
await assert.rejects(invoke('claim', {}, { ...peer, principal: { kind: 'guest' } }), /owner-required/);
console.log('Installed plugin: independent Host/consumer Cordis copies, Remote claim/ack and owner guard passed');
