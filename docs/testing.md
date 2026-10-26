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

## Current-session shortcut (cloud development)

- Register `dsh-deeplink.copy-current-session` through the official shortcut service. Only `desktop:macos` defaults to Cmd+Shift+C; Linux Ctrl+Shift+C remains reserved. No independent keydown listener, recorder, preference file, or native accelerator is installed.
- Official rc.2 recorder is internal, so the user-approved fallback is a read-only effective-keycap widget inside `plugins.bundle.config` for `dsh-deeplink`. The command also participates in the official global shortcut editor.
- Automated `npm test`: 31 passing, including current-vs-row targeting, blocked contexts, effective-menu catalog rebinding, detail widget states, disposal and no browser polling.
- Official protocol verification: two additional tests run as part of `npm test` against the pinned rc.2 development dependency. Covers accepted Mac default, overlapping default rejection, Linux copy reservation, accepted rebind, persistence across owner reload, stale/conflicting edits, failed storage writes, clear and reset. Uses a memory storage adapter, not user preferences.

### UI acceptance

1. Click dsh-deeplink in the official plugin list. Confirm the widget appears on its detail page, wraps at narrow widths and displays the effective binding (initially Unbound on Linux).
2. In the official global shortcut editor, bind the command to an accepted nonreserved test combination. Verify detail and session menu update immediately and after reload. Cancel recording and try a conflicting binding; accepted keys must not change.
3. View session A and open session B’s row menu. Clicking the row action copies B; dismissing the menu and pressing the shortcut copies A. Both links omit `instance` and no session is changed.
4. Repeat with composer focus; no prompt is sent. Global pages, blank/no session, archived and subagent targets are blocked. Disable/re-enable the plugin without duplicate commands or contributions.
5. Check Chinese and English menu labels at ordinary/narrow widths with a long accepted binding; retain official static ellipsis behavior, not marquee. Restore or clear the temporary test binding.

Cloud Linux tests do not constitute native macOS physical keyboard or clipboard acceptance; do not claim otherwise. Cloud browser QA completed after explicit user permission for a bounded retry of the initial approval-service metadata failure. The checks below were performed by the parent task on the cloud computer.

- `npm run test:install`: passed using a writable cloud npm cache; confirms the packed plugin remains isolated from dev dependencies and activates through a separate Host runtime.

### Shortcut cloud UI verification — 2026-10-26

Environment: official rc.2 cloud Web UI, Linux Chromium. No user Mac access.

- Official plugin list → dsh-deeplink detail displayed the read-only widget, initially **未绑定**, as expected on Linux.
- Settings → General → Keyboard shortcuts included **复制当前会话 Deeplink**. The official browser recorder rejected unsupported Alt+J and accepted **Ctrl+Shift+Period** under its own key restrictions. The detail widget updated immediately.
- A real shortcut keypress copied exactly `dsh-link://session/session-cloud-tree-main`, with no `instance` query. It still worked after page reload, confirming accepted preference persistence. On **New Session**, the same keypress left a sentinel clipboard value unchanged.
- The session menu displayed the effective **Ctrl+Shift+Period** binding at the right. At a 1188px viewport the complete Chinese label measured 80px with `scrollWidth` 80px; the shortcut was 48px with a 6px gap, without overlap or truncation. Official static ellipsis styling is retained; no marquee was introduced.
- Starting a new recording and pressing Escape preserved the accepted binding. Restoring this command’s default cleared the Linux binding; the detail immediately returned to **未绑定**. Closing settings left no stale modal.

Native macOS Cmd+Shift+C dispatch was not physically tested: the macOS default is covered by official protocol validation only. Other viewport/language combinations remain covered by the official responsive menu primitives rather than separate pixel acceptance in this pass.
