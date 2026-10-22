import { createServer } from 'node:http';
import { randomBytes, randomUUID, createHmac, timingSafeEqual } from 'node:crypto';
import { mkdir, lstat, writeFile, rename, unlink } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';

export const SESSION_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const terminal = new Set(['opened', 'failed', 'cancelled']);
export class RequestQueue {
  constructor({ now = Date.now, ttl = 30000, retention = 120000, limit = 128 } = {}) {
    Object.assign(this, { now, ttl, retention, limit }); this.records = new Map();
  }
  sweep() {
    for (const [id, row] of this.records) {
      if (this.now() - row.createdAt > this.retention) this.records.delete(id);
      else if (!terminal.has(row.status) && this.now() >= row.deadline) Object.assign(row, { status: 'failed', error: 'request-expired' });
    }
  }
  enqueue(requestId, sessionId) {
    if (!UUID.test(requestId) || !SESSION_ID.test(sessionId)) throw new Error('invalid-request');
    this.sweep(); const existing = this.records.get(requestId);
    if (existing) { if (existing.sessionId !== sessionId) throw new Error('request-id-conflict'); return this.view(existing); }
    if (this.records.size >= this.limit) throw new Error('queue-full');
    const row = { requestId, sessionId, createdAt: this.now(), deadline: this.now() + this.ttl, status: 'queued' };
    this.records.set(requestId, row); return this.view(row);
  }
  view(row) { if (!row) return null; const { owner, ...value } = row; return value; }
  get(id) { this.sweep(); return this.view(this.records.get(id)); }
  claim(owner) {
    this.sweep();
    // No parallel navigation, including when a second client is connected.
    if ([...this.records.values()].some(row => row.status === 'claimed')) return null;
    const row = [...this.records.values()].find(row => row.status === 'queued');
    if (!row) return null;
    Object.assign(row, { status: 'claimed', owner }); return this.view(row);
  }
  ack(owner, requestId, status, error) {
    this.sweep(); const row = this.records.get(requestId);
    if (!row || row.owner !== owner || row.status !== 'claimed') throw new Error('claim-not-owned');
    if (!terminal.has(status)) throw new Error('invalid-status');
    Object.assign(row, { status, ...(error ? { error: String(error).slice(0, 160) } : {}) }); return this.view(row);
  }
  close() { for (const row of this.records.values()) if (!terminal.has(row.status)) Object.assign(row, { status: 'cancelled', error: 'host-stopped' }); }
}
export function defaultDirectory() {
  return process.platform === 'darwin' ? join(homedir(), 'Library', 'Application Support', 'DSH Deeplink', 'instances') : join(homedir(), '.local', 'state', 'dsh-deeplink', 'instances');
}
export async function privateDirectory(directory) {
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const stat = await lstat(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) || stat.uid !== process.getuid?.()) throw new Error('insecure-discovery-directory');
}
export async function createBridge({ directory = defaultDirectory(), queue = new RequestQueue() } = {}) {
  if (directory === defaultDirectory()) await privateDirectory(dirname(directory));
  await privateDirectory(directory);
  const instanceId = randomUUID(), token = randomBytes(32).toString('hex');
  let port;
  const reply = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const server = createServer(async (req, res) => {
    try {
      // Browser origins (including null) are never accepted. This API is native-only.
      if (req.headers.origin !== undefined || req.headers.host !== `127.0.0.1:${port}` || req.headers['sec-fetch-site'] !== undefined) return reply(res, 403, { error: 'native-loopback-only' });
      const url = new URL(req.url, `http://127.0.0.1:${port}`);
      if (req.method === 'GET' && url.pathname === '/v1/identity') {
        const nonce = url.searchParams.get('nonce');
        if (!/^[0-9a-f]{32}$/.test(nonce ?? '')) return reply(res, 400, { error: 'invalid-nonce' });
        return reply(res, 200, { instanceId, proof: createHmac('sha256', token).update(`${nonce}:${instanceId}`).digest('hex') });
      }
      const supplied = req.headers.authorization ?? '';
      const expected = `Bearer ${token}`;
      if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) return reply(res, 401, { error: 'unauthorized' });
      if (req.method === 'GET' && url.pathname.startsWith('/v1/requests/')) {
        const id = url.pathname.slice('/v1/requests/'.length);
        const row = UUID.test(id) ? queue.get(id) : null;
        return reply(res, row ? 200 : 404, row ?? { error: 'request-not-found' });
      }
      if (req.method !== 'POST' || url.pathname !== '/v1/open') return reply(res, 404, { error: 'not-found' });
      if (req.headers['content-type'] !== 'application/json') return reply(res, 415, { error: 'json-required' });
      let bytes = 0, chunks = [];
      for await (const chunk of req) { bytes += chunk.length; if (bytes > 1024) { reply(res, 413, { error: 'body-too-large' }); return; } chunks.push(chunk); }
      let body; try { body = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { return reply(res, 400, { error: 'invalid-json' }); }
      if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).sort().join(',') !== 'requestId,sessionId') return reply(res, 400, { error: 'invalid-request' });
      return reply(res, 202, queue.enqueue(body.requestId, body.sessionId));
    } catch (error) { reply(res, error.message === 'queue-full' ? 429 : 400, { error: error.message }); }
  });
  server.requestTimeout = 5000; server.headersTimeout = 5000; server.keepAliveTimeout = 1000;
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  const manifest = { schemaVersion: 1, instanceId, port, token, pid: process.pid, createdAt: new Date().toISOString() };
  const path = join(directory, `${instanceId}.json`), tmp = `${path}.tmp`;
  try { await writeFile(tmp, JSON.stringify(manifest), { flag: 'wx', mode: 0o600 }); await rename(tmp, path); }
  catch (error) { server.close(); await unlink(tmp).catch(() => {}); throw error; }
  let closed = false;
  return { manifest, queue, async close() { if (closed) return; closed = true; queue.close(); await unlink(path).catch(() => {}); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); } };
}
