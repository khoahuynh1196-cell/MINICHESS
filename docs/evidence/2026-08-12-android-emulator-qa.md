# Android emulator QA — 2026-08-12

This is emulator evidence only. It does not close the physical-device release
gate.

## Environment

- Godot 4.7.1 Compatibility renderer.
- Android 15 / API 35 Google APIs x86_64 emulator (`canonical_api35`).
- Logical and physical viewport: 1080×1920.
- Package: `com.autobattler.alpha`.
- APK: `tmp/auto-battler-canonical-4x6-debug.apk`.
- APK SHA-256: `D2734E0FABD08C29D5B280382502A7181CD75FF26D1F03BA2678033EF5C909C4`.

## Results

- Install: PASS (`adb install -r`).
- Launch/focus: PASS; `GodotAppLauncher` process present.
- Portrait surface: PASS; Android reports 1080×1920.
- OpenGL ES: PASS; emulator reports OpenGL ES 3.0 SwiftShader and the Godot
  project uses Compatibility/OpenGL ES 3.
- Screenshot: `tmp/android-api35-canonical-4x6-lobby-final.png` (fresh install/launch
  smoke; capture hash `4CB1C434A0679E734B09711E03541C575CC9921BEC7B1F45944DA7C54F170DC6`).
- Runtime memory sample: `TOTAL PSS 564907 KB`, `TOTAL RSS 763160 KB` after launch
  (previous diagnostic sample).
- Fresh `dumpsys gfxinfo` sample: 19 frames, 6 janky frames (31.58%), 50th
  percentile 27 ms, 90th percentile 53 ms, 95th percentile 200 ms. This short
  emulator sample is diagnostic, not a release performance claim.

## Gate status

Emulator install/render smoke is PASS. Physical-device touch, audio loudness,
latency, thermal behavior, and release performance remain OPEN until a real
reference device is connected and exercised.
