# 4x6 capture and Android QA evidence — 2026-08-12

## Desktop capture

- Godot: 4.7.1, Compatibility renderer.
- Command: `Godot_v4.7.1-stable_win64.exe --path client-godot --script res://tools/capture_adventure_frame.gd --quit-after 5`
- Result: PASS, 1080×1920 PNG, 8 replay units.
- Frame: `tmp/adventure-combat-frame-1080x1920.png`.
- Metadata: `tmp/adventure-combat-frame-1080x1920.json`.
- Metadata declares `production-4x6-0.1.0`, `alpha-0.4.0`, and
  `asset-4x6-0.1.0`; board footer-safe boundary is `y=828`.
- Visual inspection confirms the four-column/six-row board stays inside the
  portrait composition and the shop/action footer remains below it.

## Godot regression

All 38 scripts under `client-godot/test/*_test.gd` passed with the Compatibility
renderer, including replay migration/rejection, arena geometry, animation
priority, audio cue resolution, VFX pooling, Gate 2 stress, and mobile accessibility.

## Android status

Physical-device QA is **blocked**, not passed. `platform-tools` and OpenJDK 17
are now installed/configured for the Android SDK, but the SDK still lacks
`build-tools`/a platform package and matching Godot Android export templates.
The export command therefore fails before producing an APK. Both the SDK and
LDPlayer `adb` clients report no connected device. This checkpoint makes no
claims about touch, FPS, frame-time percentiles, texture memory, loudness, or
latency on Android. The existing 2026-08-04 emulator note remains historical
evidence only.

Required next evidence: install/configure the Android SDK and export templates,
export the canonical APK, install on the agreed physical device, exercise the
full touch flow, and record renderer/build hash/frame-time/texture memory.
