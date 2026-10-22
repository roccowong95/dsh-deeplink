import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol';
import { createBridge, RequestQueue } from './bridge.js';

// Plain-JS application of the official standard decorator; no private symbols.
const initializers = [];
export class DeeplinkService extends TypertRemoteService {
  constructor(ctx, queue) {
    super(ctx, 'deeplink'); this.queue = queue;
    for (const initialize of initializers) initialize.call(this);
  }
  owner() {
    const peer = this.ctx.invocation?.peer;
    if (!peer || peer.principal.kind !== 'owner' || peer.interactions !== 'answer' || peer.signal.aborted) throw new Error('desktop-owner-required');
    return peer.id;
  }
  claim() { return this.queue.claim(this.owner()); }
  ack(requestId, status, error) { return this.queue.ack(this.owner(), requestId, status, error); }
}
for (const name of ['claim', 'ack']) Remote(DeeplinkService.prototype[name], {
  name, kind: 'method', static: false, private: false,
  addInitializer(initialize) { initializers.push(initialize); },
});
export const name = 'deeplink';
export const inject = ['typertGateway'];
export function apply(ctx) {
  const queue = new RequestQueue();
  const service = new DeeplinkService(ctx, queue);
  ctx.effect(() => {
    let disposed = false, bridge;
    const pending = createBridge({ queue }).then(async value => {
      if (disposed) await value.close(); else bridge = value;
    });
    pending.catch(error => ctx.logger?.warn?.(`deeplink listener unavailable: ${error.message}`));
    return async () => { disposed = true; await pending.catch(() => {}); await bridge?.close(); };
  });
  return service;
}
