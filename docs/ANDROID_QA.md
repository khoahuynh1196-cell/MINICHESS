# Android QA

## Build configuration

- Godot 4.7 Compatibility (OpenGL ES 3) renderer, portrait-locked `1080 x 1920` logical viewport.
- Debug export preset: `Android Debug`, ARM64, package `com.autobattler.alpha`.
- UI regression: `res://test/mobile_ui_accessibility_test.gd` verifies portrait bounds, 44-pixel touch targets, visible disabled encounter nodes, and text labels for all controls.
- A local debug APK was exported, aligned, signed, and verified on 2026-08-04 at `tmp/auto-battler-debug-gl-expand.apk`.
- Current APK SHA-256: `37F4759CBC6D2A98D5A024E9955FCD2620CB5F9220EAE92488483177C6CC59BF`.
- `apksigner verify --verbose` passed with APK Signature Scheme v2 and v3.

## 2026-08-04 automated Android evidence

- The Godot Android Debug export completed successfully, including alignment, debug signing, and v2/v3 signature verification.
- The Android Emulator Hypervisor Driver was installed and its `aehd` service was verified running. The `medium_phone` x86_64 AVD booted and accepted `adb install -r` of the APK.
- The app process launches successfully as `com.autobattler.alpha`; the native portrait Lobby was captured at `tmp/android-lobby-expand.png` on the `1080 x 2400` AVD. The design canvas expands vertically on this 20:9 display, without letterbox bars.
- Initial Vulkan/Mobile export attempts failed only at the emulator presentation queue (`VkResult error 5`), producing a black SurfaceView. The project now uses the 2D-appropriate Compatibility renderer. The installed APK reports `OpenGL ES 3.1` and renders the Lobby without the Vulkan present failure.
- ADB-injected taps reached Android's focused app window but did not progress the Godot Lobby on this AVD, including after the viewport was expanded. This is not recorded as a passing input result; a real-device touch pass remains required. No FPS, frame-time, or texture-memory claim is made from this emulator.

## Release-device checklist

Run this checklist on the agreed physical Android device before publishing an APK:

1. Install a fresh debug APK, launch, and verify Lobby, Map, Prepare, Combat, Reward, Recap, Collection, and Settings.
2. Start, save, terminate, then resume an eight-round run; verify no formation or item command can be sent outside Prepare.
3. Verify all controls remain tappable around the notch and system-navigation inset, including bottom-sheet controls.
4. Toggle Vietnamese, sound, haptics, reduced motion, and text scale; restart the app and verify persistence.
5. Record device, Android version, build hash, frame-time percentile, texture memory, and any failures in the release evidence.

The remaining Android evidence requires a physical reference device for install, input, and performance measurements.

## 2026-08-12 canonical 4x6 checkpoint

- Desktop Godot capture and all 38 headless client tests pass against the
  canonical `production-4x6-0.1.0` ruleset.
- Android export now succeeds with Godot 4.7.1 after installing the matching
  export template and configuring OpenJDK 17, Android platform 35, and
  build-tools 35.0.0. The canonical debug APK was signed and verified with APK
  Signature Scheme v2/v3 on 2026-08-12; SHA-256 is
  `EDC295D8C2F0713B4A2C4B63A711681D7A2A63422BB2D69CACD6824C785DFC1F`.
- Physical-device QA remains **blocked**, not passed: `adb devices` reports no
  connected device (the LDPlayer and SDK ADB clients are both empty). No touch,
  FPS, frame-time, texture-memory, loudness, or latency result is claimed.
- Follow-up must install the canonical APK on the agreed physical device, then
  record touch, renderer, frame-time, texture-memory, audio, and build-hash
  evidence here.
