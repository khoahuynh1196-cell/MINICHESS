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

Godot 4.7.1 Android export is now **PASS**: the matching export template,
Android platform 35, build-tools 35.0.0, and OpenJDK 17 produced and signed
`tmp/auto-battler-canonical-4x6-debug.apk` on 2026-08-12. `apksigner verify`
passed APK Signature Scheme v2/v3; SHA-256 is
`EDC295D8C2F0713B4A2C4B63A711681D7A2A63422BB2D69CACD6824C785DFC1F`.

Physical-device QA is still **blocked**, not passed. Both the SDK and LDPlayer
`adb` clients report no connected device. This checkpoint makes no claims about
touch, FPS, frame-time percentiles, texture memory, loudness, or latency on
Android. The existing 2026-08-04 emulator note remains historical evidence
only.

Required next evidence: install the canonical APK on the agreed physical
device, exercise the full touch flow, and record renderer/build hash/frame-time
and texture memory.
