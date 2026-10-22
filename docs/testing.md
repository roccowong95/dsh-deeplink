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
