# macOS helper

Native Swift/AppKit menu-bar app; no Electron, Node runtime, login item or daemon. macOS 12+. Both clicks open the menu; **Quit DSH Deeplink** cancels local helper work without quitting DSH. A request already accepted by DSH may still finish (queue lifetime: 30 seconds). A later `dsh-link:` URL may launch the helper again.

## Build / release

Requires macOS + Xcode Command Line Tools:

```sh
./macos/test.sh
./macos/build.sh arm64       # or x86_64 / universal
./macos/release.sh arm64     # ZIP + SHA-256
```

Copy the app to Applications and open it. On first session link, choose your trusted **DeepSeek Harness.app** (or use **Choose DSH.app…**). No bundle identifier is guessed: upstream gets it from its build environment. Enable both DSH plugin components.

```text
dsh-link://session/SESSION_ID
dsh-link://session/SESSION_ID?instance=INSTANCE_UUID
```

Session IDs are 1–128 ASCII letters, digits, `_` or `-`. Links only navigate; no code, prompt, shell command or bearer token belongs in them. Multiple authenticated instances require an explicit choice; instance-qualified links never silently fall back.

## Signing

Releases are **ad-hoc signed, not Apple-notarized**, per project policy. `codesign --verify` checks integrity, not trusted publisher identity. Downloads may be blocked by Gatekeeper; this project never strips quarantine or disables system protections. Release filenames explicitly include `adhoc`.

A future trusted distribution can use Developer ID Application signing, hardened runtime and secure timestamp, followed by `notarytool submit --wait`, `stapler staple` and verification. This needs the publisher's Apple Developer credentials; none are embedded or requested here. See [Apple notarization guidance](https://developer.apple.com/documentation/security/notarizing-macos-software-before-distribution).

## Bridge and bounds

Reads current-user-owned private manifests under `~/Library/Application Support/DSH Deeplink/instances`. Both private directories must deny group/other access and manifests must be regular private files. Skips dead hosts and checks newest validated manifests first; response bodies are capped at 64 KiB while streaming. Uses IPv4 loopback only, ephemeral URLSession, no proxies/cookies/redirects, HMAC identity proof before sending the bearer token. Waits up to 30 seconds for plugin startup, then up to 30 seconds for the client's navigation acknowledgment (session preload and main-view/panel state confirmed, not pixel-render verification). A timeout is **not** proof the session did not open.

No login startup, background updater, analytics or access to chat content. This is not a sandboxed App Store app. A malicious process already running as the same user can read user-private files: this bridge does not create a security boundary against it.

## Manual QA (separate test profile)

1. Build, inspect signature, launch: one status icon, no Dock icon; left/right clicks show menu.
2. With both plugin components enabled, open a real session link: correct session opens and status says “Session opened”, not merely queued. Repeat with DSH closed (first choose trusted app).
3. Invalid/missing session: error without shell execution or false success. Reject foreign scheme, userinfo, query token, slashes, oversized ID.
4. Two hosts: explicit chooser; `?instance=` chooses only matching instance. Stale manifest/wrong token/wrong proof/reused port: no authenticated request to unverified listener.
5. Stop client/plugin: bounded error; retry after enabling it. A second link while busy is rejected visibly.
6. Quit via right-click during wait: icon/process exits, DSH stays running. Opening a later link relaunches helper. Accepted requests may still finish after helper exit; expired tasks must not be reported as success.
7. Downloaded ad-hoc ZIP: record Gatekeeper result honestly; don't remove quarantine or claim notarization. Check architecture on Apple silicon/Intel if claiming both.

Cloud source review is not a macOS compile or end-to-end pass; native build/UI checks must run on macOS.
