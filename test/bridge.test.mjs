import test from 'node:test';
import { request as httpRequest } from 'node:http';
import assert from 'node:assert/strict';
import { mkdtemp, rm, stat, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID, createHmac } from 'node:crypto';
import { RequestQueue, createBridge } from '../lib/bridge.js';

test('queue deduplicates, refuses collisions, serializes claims and owns acknowledgements', () => {
 const q = new RequestQueue(), id = randomUUID();
 assert.equal(q.enqueue(id,'abc').status,'queued'); q.enqueue(id,'abc');
 assert.throws(()=>q.enqueue(id,'other'),/conflict/);
 assert.equal(q.claim('one').requestId,id); assert.equal(q.claim('two'),null);
 assert.throws(()=>q.ack('two',id,'opened'),/owned/);
 assert.equal(q.ack('one',id,'opened').status,'opened');
 assert.equal(q.enqueue(id,'abc').status,'opened'); assert.equal(q.claim('one'),null);
});
test('queue expires, bounds memory and validates IDs', () => {
 let now=0; const q=new RequestQueue({now:()=>now,ttl:30,retention:120,limit:1}),id=randomUUID();
 q.enqueue(id,'abc'); assert.throws(()=>q.enqueue(randomUUID(),'def'),/full/);
 now=30;assert.equal(q.get(id).error,'request-expired'); now=121;assert.equal(q.get(id),null);
 for(const value of ['../bad','','x'.repeat(129),'a/b'])assert.throws(()=>q.enqueue(randomUUID(),value),/invalid/);
});
test('native loopback protocol: private discovery, HMAC, auth, browser rejection, status and cleanup', async () => {
 const directory=await mkdtemp(join(tmpdir(),'dsh-deeplink-')); const b=await createBridge({directory});
 try {
  const {token,port,instanceId}=b.manifest, base=`http://127.0.0.1:${port}`;
  assert.equal((await stat(join(directory,`${instanceId}.json`))).mode&0o777,0o600);
  const nonce='ab'.repeat(16), identity=await (await fetch(`${base}/v1/identity?nonce=${nonce}`)).json();
  assert.equal(identity.proof,createHmac('sha256',token).update(`${nonce}:${instanceId}`).digest('hex'));
  assert.equal((await fetch(`${base}/v1/open`,{method:'POST'})).status,401);
  assert.equal((await fetch(`${base}/v1/identity?nonce=${nonce}`,{headers:{Origin:'null'}})).status,403);
  assert.equal(await new Promise(resolve=>{const req=httpRequest(`${base}/v1/identity?nonce=${nonce}`,{headers:{Host:'evil.example'}},res=>{res.resume();resolve(res.statusCode)});req.end();}),403);
  const headers={Authorization:`Bearer ${token}`,'Content-Type':'application/json'},id=randomUUID();
  const post=body=>fetch(`${base}/v1/open`,{method:'POST',headers,body:JSON.stringify(body)});
  assert.equal((await post({requestId:id,sessionId:'abc',command:'bad'})).status,400);
  assert.equal((await post({requestId:id,sessionId:'abc'})).status,202);
  assert.equal((await post({requestId:id,sessionId:'abc'})).status,202);
  b.queue.claim('owner');b.queue.ack('owner',id,'opened');
  assert.equal((await(await fetch(`${base}/v1/requests/${id}`,{headers})).json()).status,'opened');
  assert.equal((await post({requestId:randomUUID(),sessionId:'x'.repeat(2048)})).status,413);
 } finally {await b.close();await b.close();assert.deepEqual(await readdir(directory),[]);await rm(directory,{recursive:true});}
});
test('insecure discovery directory fails closed',async()=>{
 const directory=await mkdtemp(join(tmpdir(),'dsh-deeplink-'));const {chmod}=await import('node:fs/promises');
 await chmod(directory,0o755);await assert.rejects(createBridge({directory}),/insecure/);await rm(directory,{recursive:true});
});
test('late acknowledgements cannot turn an expired request into success; shutdown cancels pending',()=>{
 let now=0;const q=new RequestQueue({now:()=>now,ttl:10}),id=randomUUID();q.enqueue(id,'abc');q.claim('owner');now=10;
 assert.throws(()=>q.ack('owner',id,'opened'),/owned/);assert.equal(q.get(id).status,'failed');
 const next=randomUUID();q.enqueue(next,'def');q.close();assert.equal(q.get(next).status,'cancelled');
});
