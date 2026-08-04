# Demo Release Checklist

Last audited: 2026-08-04

## Verified in this workspace

- [x] TypeScript typecheck and test suites pass: 100 `game-core` tests and 142 `server` tests.
- [x] Godot replay, run, UI, asset-manifest, feedback, and accessibility suite passes: 32 headless tests.
- [x] Portrait mobile flow reaches Lobby, Map, Prepare, Combat, Reward, Recap, Collection, and Settings.
- [x] Prepare supports tap-select formation moves, board swaps, board-to-bench moves, item selection/equip feedback, sell, XP, five-card shop, tier odds, authoritative shop lock, and start-round intents.
- [x] Combat presentation uses the hero rig when a source texture is supplied; reduced-motion reaches that rig.
- [x] Collection provides 20 roster entries and species/role filtering.
- [x] English and Vietnamese UI catalog infrastructure, sound/haptic settings, and reduced-motion settings are covered by tests.
- [x] Android Debug APK export, alignment, debug signing, and verification complete locally.
- [x] CI runs the TypeScript gate, whitespace gate, and all Godot headless tests.

## Required before calling this a production release

- [ ] Replace full-body preview art with reviewed cutout layers, 20 portrait crops, ability icons, item icons, biome layers, and recorded audio. The checked-in rig documents the required contract; its current procedural weapon/VFX/audio remain a temporary presentation path.
- [ ] Capture and review real portrait screenshots for every primary game state on a physical Android device.
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
