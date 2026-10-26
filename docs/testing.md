# Desktop acceptance checklist

Use the authorized **macmini desktop profile** only for testing, after cloud implementation. Do not auto-send prompts, change models, unarchive/delete conversations, or modify existing credentials. Record DSH version, macOS version, plugin commit, and companion build.

1. Install test package and companion, with a reversible profile/config backup. Choose official DSH.app. Confirm menu-bar icon and right-click Quit.
2. Choose two existing non-archived test sessions. Open a valid link from another app; confirm correct visible conversation, `opened` result, and no new model request/message.
3. Cold start Desktop from a link. Confirm waiting discovers the plugin and opens once; no duplicate navigation.
4. Open malformed/unknown/archived IDs. Confirm explicit failure and no creation/unarchive. During a deliberately slow load switch to another session/global page; confirm no focus steal.
5. Open same request ID twice through protocol fixture: one navigation. Two Desktop instances must produce explicit choice; explicit instance must not silently fall back.
6. Quit helper while idle and while waiting. Confirm it exits, Desktop survives, no background helper process. A request already accepted may complete.
7. Disable/re-enable plugin, restart Desktop, and occupy an old port with a dummy process: stale discovery must not receive bearer credentials. Never use real credentials in logs.
8. Verify release signature with `codesign --verify --deep --strict`; record ad-hoc signature separately from notarization. Gatekeeper behavior must be reported, not silently bypassed.

Cloud tests are not a substitute for these full Desktop checks. `opened` checks DSH selection state, not rendered pixels.

## Copy Deeplink (cloud Web UI)

The session-menu action can be tested entirely in the cloud; no macOS helper or user computer is needed for this feature.

1. Keep session A selected and open session B's `…` menu. Confirm exactly one **复制 Deeplink / Copy Deeplink** appears directly after **Copy Session ID**.
2. Select it: the menu closes, the clipboard contains exactly `dsh-link://session/B_ID` with no query, and a success toast appears. Session A stays selected; no history load or Host mutation is caused by copying.
3. Repeat for another row and by keyboard. Deny clipboard writes: confirm failure feedback, then allow writes and retry successfully.
4. Reopen the menu repeatedly and disable/re-enable the plugin: no duplicate entry or stale toast. Disable while a clipboard write is pending: no late feedback after unload.
5. Confirm the ordinary browser does not poll the Desktop deeplink queue. Opening the copied URL through macOS remains a separate Desktop acceptance check above.

### Cloud verification — 2026-10-26

Environment: DSH 0.2.1-rc.2, Node 24.22.1, cloud Chromium. Development and testing stayed on the cloud computer.

- Menu contained one **复制 Deeplink** directly below **Copy Session ID**.
- Clicking showed **Deeplink 已复制** and the clipboard contained exactly `dsh-link://session/session-cloud-tree-main`; repeated copying produced the same result, with no instance query.
- With **New Session** selected, copying the original row's link still copied its original ID and left **New Session** selected (no navigation).
- Initial UI testing exposed a missing selector argument for the injected notice hook. Fixed with `useNotice(value => value)`, tightened the regression test, and reran the real UI checks successfully.
- `npm test`: 22 passed. `git diff --check`: clean. Package dry-run succeeded with a writable cloud npm cache.

Clipboard denial/retry, pending-write disposal, and duplicate-free slot reload are covered by automated tests; they were not separately exercised in this Chromium UI pass. Native macOS URL opening was outside this cloud-only verification.

## Installation recovery verification — 2026-10-26 (cloud only)

Target: official DSH 0.2.1-rc.2, Node 24.22.1; GitHub commit `77efc147d1d14951b0edb886278db9f81a538638`.

- A fresh GitHub install with ordinary npm (`--omit=dev`) and pnpm both imported successfully, but those managers auto-install peers by default. This alone is **not** sufficient evidence for DSH.
- Installed the same GitHub commit with the official `dsh plugin --profile web add` into a new, isolated profile. DSH generated `nodeLinker: hoisted` and `autoInstallPeers: false`; only the plugin was installed. Plain Node import therefore failed, as expected, without the Host resolver.
- Booted that profile with the official Host: plugin activation, real Gateway owner `claim`/`ack`, and guest denial all passed. The declared protocol peer is supplied by DSH’s runtime interception. Keep the peer declaration; do not bundle another Gateway/Host or install duplicate runtime services as a speculative fix.
- Reproduced the reported local-path error by linking a checkout with no `node_modules`. Replacing it with the GitHub package updated the manifest and physical installed path, but the same Node process still reported the old checkout’s missing protocol dependency. A new process imported the GitHub package successfully. This matches the screenshot’s local import path despite its GitHub source label; the user’s actual Desktop state was not accessed.
- Added a deterministic, network-free link-recovery test to `npm test` (23 passing). Added opt-in `npm run test:install` (passing): packs current source, installs a production copy outside the checkout, confirms no dev Gateway in the consumer, and exercises Remote calls against a separately loaded Host/Cordis runtime. This npm smoke complements, rather than replaces, the official DSH activation check above.

Recovery is full Host/Desktop restart first; if needed, remove and re-add only `dsh-deeplink` in the existing Desktop profile and restart again. No application reinstall, profile deletion, or session changes are needed. Native macOS recovery was not tested; all checks above ran on the cloud computer.

### GitHub-installed cloud UI check

The existing cloud preview profile was changed from the local `link:` checkout to the GitHub commit above through the official DSH installer, retaining its TreeView and Better Sidebar plugins. After restarting the official Host:

- Startup had no plugin activation errors.
- The session menu showed **复制 Deeplink** exactly once.
- With **New Session** active, copying the original row displayed **Deeplink 已复制** and put exactly `dsh-link://session/session-cloud-tree-main` on the clipboard, without changing the selected session.

For intentional `link:` development installs, run `npm ci && npm run build` inside the linked checkout before restarting the Host. The recovery CLI commands require an installed DSH CLI and an already initialized Desktop profile; the plugin UI is the alternative when the CLI is unavailable.
