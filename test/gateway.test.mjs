import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Context } from '@deepseek-ai/cordis';
import { TypertRegistry } from '@deepseek-ai/dsh-typert-registry';
import { TypertGatewayService } from '@deepseek-ai/dsh-api-gateway';
import { DeeplinkService } from '../lib/index.js';
import { RequestQueue } from '../lib/bridge.js';

test('real DSH 0.2.1-rc.2 Gateway discovers plain-JS Remote methods, validates args, binds owner peer',async()=>{
 const ctx=new Context();new TypertRegistry(ctx);
 ctx.provide('remoteAccess',{decide:()=>({kind:'allow'})});
 const gateway=new TypertGatewayService(ctx,{websocketHeartbeatIntervalMs:2000,streamInboxBytes:262144});
 const q=new RequestQueue();new DeeplinkService(ctx,q);
 const id=randomUUID();q.enqueue(id,'abc');
 const peer={id:'owner-peer',ctx,principal:{kind:'owner'},signal:new AbortController().signal,interactions:'answer'};
 const invoke=(method,args,p=peer)=>gateway.invoke({namespace:'deeplink',method,args,peer:p});
 assert.equal((await invoke('claim',{})).requestId,id);
 assert.equal((await invoke('ack',{requestId:id,status:'opened',error:''})).status,'opened');
 await assert.rejects(invoke('ack',{requestId:id,status:'opened',error:'',extra:true}),/argument|field/i);
 await assert.rejects(invoke('claim',{}, {...peer,principal:{kind:'guest'}}),/owner-required/);
});
