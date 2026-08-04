# Android QA

## Build configuration

- Godot 4.7 Compatibility (OpenGL ES 3) renderer, portrait-locked `1080 x 1920` logical viewport.
- Debug export preset: `Android Debug`, ARM64, package `com.autobattler.alpha`.
- UI regression: `res://test/mobile_ui_accessibility_test.gd` verifies portrait bounds, 44-pixel touch targets, visible disabled encounter nodes, and text labels for all controls.
- A local debug APK was exported, aligned, signed, and verified on 2026-08-04 at `tmp/auto-battler-debug-gl.apk`.
- Current APK SHA-256: `556F18ECC9A865A0A5F80F54654225AF6E4856BB95125927D7AF931E937A2286`.
- `apksigner verify --verbose` passed with APK Signature Scheme v2 and v3.

## 2026-08-04 automated Android evidence

- The Godot Android Debug export completed successfully, including alignment, debug signing, and v2/v3 signature verification.
- The Android Emulator Hypervisor Driver was installed and its `aehd` service was verified running. The `medium_phone` x86_64 AVD booted and accepted `adb install -r` of the APK.
- The app process launches successfully as `com.autobattler.alpha`; the native portrait Lobby was captured at `tmp/android-lobby-gl.png` on the `1080 x 2400` AVD. The `1080 x 1920` game viewport is intentionally letterboxed vertically on that 20:9 display.
- Initial Vulkan/Mobile export attempts failed only at the emulator presentation queue (`VkResult error 5`), producing a black SurfaceView. The project now uses the 2D-appropriate Compatibility renderer. The installed APK reports `OpenGL ES 3.1` and renders the Lobby without the Vulkan present failure.
- ADB-injected taps reached Android's focused app window but did not progress the Godot Lobby on this AVD. This is not recorded as a passing input result; a real-device touch pass remains required. No FPS, frame-time, or texture-memory claim is made from this emulator.

## Release-device checklist

Run this checklist on the agreed physical Android device before publishing an APK:

1. Install a fresh debug APK, launch, and verify Lobby, Map, Prepare, Combat, Reward, Recap, Collection, and Settings.
2. Start, save, terminate, then resume an eight-round run; verify no formation or item command can be sent outside Prepare.
3. Verify all controls remain tappable around the notch and system-navigation inset, including bottom-sheet controls.
4. Toggle Vietnamese, sound, haptics, reduced motion, and text scale; restart the app and verify persistence.
5. Record device, Android version, build hash, frame-time percentile, texture memory, and any failures in the release evidence.

The remaining Android evidence requires a physical reference device for install, input, and performance measurements.
