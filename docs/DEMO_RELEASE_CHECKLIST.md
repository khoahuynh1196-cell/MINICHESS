# Demo Release Checklist

Last audited: 2026-08-12

## Verified in this workspace

- [x] TypeScript typecheck and test suites pass: 115 `game-core` tests and 183 `server` tests.
- [x] Godot replay, run, UI, asset-manifest, feedback, accessibility, Gate 2 stress, and online session suite passes: 40 headless tests.
- [x] Portrait mobile flow reaches Lobby, Map, Prepare, Combat, Reward, Recap, Collection, Settings, and Online PvP.
- [x] Prepare supports tap-select formation moves, board swaps, board-to-bench moves, item selection/equip feedback, sell, XP, five-card shop, tier odds, authoritative shop lock, and start-round intents.
- [x] Combat presentation uses the hero rig when a source texture is supplied; reduced-motion reaches that rig.
- [x] Collection provides 20 roster entries and species/role filtering.
- [x] English and Vietnamese UI catalog infrastructure, sound/haptic settings, and reduced-motion settings are covered by tests.
- [x] Android Debug APK export/signature verification: Godot 4.7.1 template, Android 35/build-tools 35.0.0, and OpenJDK 17; see `docs/evidence/2026-08-12-4x6-capture-and-device-qa.md`.
- [x] Android 15/API 35 emulator install/launch/portrait smoke; diagnostic evidence is recorded separately.
- [ ] Physical-device install, touch, audio, and performance evidence: not available in this environment.
- [x] CI runs the TypeScript gate, whitespace gate, and all Godot headless tests.

## Required before calling this a production release

- [x] Generated and manifest-validated hero, monster, biome, item, VFX, and audio presentation assets are present for the Adventure slice; recorded/mastered device mix remains a release follow-up.
- [ ] Complete real-device touch QA and capture/review portrait screenshots for every primary game state. The AVD launch screenshot is evidence of install/render only; its injected touch path did not pass.
- [ ] Install the exported APK on the agreed reference device and record 60 FPS frame-time and texture-memory results in `ANDROID_QA.md`.
- [ ] Decide whether server authentication, Supabase persistence, and RLS are required for this offline-first Alpha. Adding them needs a provisioned Supabase project and environment secrets; they are not safely inferable from source code alone.
- [x] Shop locking and displayed tier odds are part of the Alpha rule contract: `LOCK_SHOP` persists on the server and the client renders only the returned state.
- [ ] Publish a signed release build with a non-debug signing key and complete the physical-device QA checklist.

## Reproducible checks

```powershell
pnpm run check

$godot = 'C:\path\to\Godot_console.exe'
Get-ChildItem client-godot/test/*_test.gd | ForEach-Object {
  & $godot --headless --path client-godot --script "res://test/$($_.Name)" --quit
}

& $godot --headless --path client-godot --export-debug 'Android Debug' tmp/auto-battler-debug.apk
```
