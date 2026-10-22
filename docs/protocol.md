# Wire contract v1

- URL: `dsh-link://session/<id>?instance=<optional UUID>`. ID: ASCII `[A-Za-z0-9_-]{1,128}`. No other actions or parameters.
- macOS discovery: `~/Library/Application Support/DSH Deeplink/instances/<instanceId>.json`. Parent and instances directories 0700, manifest 0600, current-user-owned, no symlink. Atomically published after binding `127.0.0.1:0`.
- Manifest: `{schemaVersion:1,instanceId,port,token,pid,createdAt}`. UUID instance, 64-hex token, ISO date. PID is informational, not identity proof.
- Before sending credentials: `GET /v1/identity?nonce=<32 lowercase hex>`; verify returned `{instanceId,proof}` where proof is hex HMAC-SHA256 with **UTF-8 token text** key and UTF-8 `nonce:instanceId` message. Never trust port alone.
- `POST /v1/open`, `Authorization: Bearer <token>`, exact `Content-Type: application/json`, body `{requestId:<UUID>,sessionId}`; 202 returns request state. Same ID/same target is idempotent; differing target conflicts.
- `GET /v1/requests/<requestId>` uses the same authentication. Status `queued → claimed → opened|failed|cancelled`; optional error string. Queued does not mean opened.
- 30-second deadline, 120-second record retention, 128-record bound, 1024-byte POST bound. Only one claim at a time. Expiry prevents late acknowledgements.
- Host RPC `deeplink/claim`, `deeplink/ack` over existing `/api` carrier, named arguments wrapped in `{args:...}`. Only owner peers with interaction permission can claim; ack must use the claiming peer. No client localhost access.
- Requests stop when the Host plugin unloads; discovery file is removed. Process crashes may leave stale files: helper authenticates each live candidate, does not delete unrelated manifests.
- Quitting the helper does not stop Desktop/plugin. Already queued requests can finish within their deadline.

API source baseline: [official DSH commit 687f282](https://github.com/deepseek-ai/deepseek-harness/tree/687f282e8625c6b8d11ff58211a90524be2e4317), notably `packages/api/gateway`, `packages/typert/protocol`, `packages/client/ui-workspace/src/client/navigation.ts`, `packages/client/ui-layout/src/client/service.ts`.
