# DSH Deeplink

Open an existing conversation in **official DSH Desktop**, using a tiny native macOS menu-bar app plus a DSH plugin. No Electron wrapper and no model calls.

```text
dsh-link://session/SESSION_ID
```

Choose **复制 Deeplink / Copy Deeplink** next to **Copy Session ID** in a session's `…` menu. It copies that row's `dsh-link://session/SESSION_ID` (never an instance query), without opening or modifying the session. Clipboard success or failure appears in a toast; failures can be retried from the menu. The copy action is available in Web and Desktop; opening links requires the macOS companion.

### Keyboard shortcut

On **macOS Desktop**, **⌘⇧C (Cmd+Shift+C)** copies the **currently viewed conversation**. The session-row menu still copies that row, even when a different conversation is open. Neither action adds an `instance` query. With no eligible conversation visible (including settings/global panels), the shortcut does nothing.

Click **dsh-deeplink** in the official plugin list to see its effective shortcut. This detail widget is read-only: the official recorder is not exposed as a reusable plugin component. To rebind, clear, or restore the default, use **Settings → General → Keyboard shortcuts** and find **Copy Current Session Deeplink**. Changes use DSH’s own persistence and conflict handling; the menu and plugin detail update with the accepted binding. Other platforms start unbound to preserve browser/editor/terminal shortcuts.

For manually constructed links, optional `?instance=UUID` selects a specific running plugin instance; otherwise the companion asks when several instances are available.

## Setup

1. Build/install the companion using [macOS instructions](macos/README.md). First use asks you to select your DSH.app.
2. In Desktop’s plugin installer, install `github:roccowong95/dsh-deeplink` into the **Desktop profile**, then fully quit and reopen Desktop. The GitHub package includes the built client; no local checkout or `npm ci` is needed for normal installation. This repository does not edit your profile automatically.
3. Open a link. The status-bar menu shows the outcome; **Quit** closes only the companion, never DSH. An already accepted request may still finish.

Compatibility target: DSH **0.2.1-rc.2**, Node ≥22.19.0. This first version uses the official Remote gateway's source-mode support; future API changes may require updates. Real Desktop acceptance testing is required before calling a release verified.

### Recover an old local installation

If `ERR_MODULE_NOT_FOUND` mentions a local checkout, **fully quit and reopen Desktop** first. If it still fails, quit Desktop and reinstall only this plugin:

```sh
dsh plugin --profile desktop remove dsh-deeplink
dsh plugin --profile desktop add github:roccowong95/dsh-deeplink
```

Reopen Desktop and enable the plugin. You can also uninstall/reinstall through Desktop’s plugin UI, then fully quit/reopen. Keep your existing profile and sessions; do not delete them. See [installation verification](docs/testing.md#installation-recovery-verification--2026-10-26-cloud-only) for details.

## Limits and safety

- Keep one UI client per Host: multiple Desktop windows sharing a Host are not individually addressable; the first polling Desktop owner client receives the request. Ordinary browser clients do not poll.
- Existing, non-archived, top-level sessions only. No creation, prompts, tools, unarchive, file opening, or shell commands.
- `opened` means the session loaded and DSH's main-view ownership/panel state confirmed selection—not a screenshot or a model response.
- A user navigation during loading cancels the pending open. Failed/expired requests are not replayed automatically.
- Localhost uses a random port, private discovery files, HMAC server verification, and per-instance bearer authentication. Browser origins are rejected. Credentials never appear in links.
- The bridge remains active while the plugin is enabled. Same-user malicious software and compromised DSH plugins are outside this boundary. URLs expose session IDs, so avoid sharing sensitive links.
- Ad-hoc signed macOS releases are allowed; they are **not Apple-notarized**. See [signing details](macos/README.md).

## Development

```sh
npm ci
npm test                 # loopback + Gateway + navigation + menu + link-recovery tests
npm run test:install     # opt-in online packed production install + independent Host test
bash macos/test.sh       # macOS only
bash macos/build.sh      # macOS only
```

[Protocol](docs/protocol.md) · [Desktop test checklist](docs/testing.md)
