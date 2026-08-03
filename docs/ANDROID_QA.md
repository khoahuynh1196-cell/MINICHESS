# Android QA

## Build configuration

- Godot 4.7 mobile renderer, portrait-locked `1080 x 1920` logical viewport.
- Debug export preset: `Android Debug`, ARM64, package `com.autobattler.alpha`.
- UI regression: `res://test/mobile_ui_accessibility_test.gd` verifies portrait bounds, 44-pixel touch targets, visible disabled encounter nodes, and text labels for all controls.
- A local debug APK was exported, aligned, signed, and verified on 2026-08-03 at `tmp/auto-battler-debug.apk`.

## Release-device checklist

Run this checklist on the agreed physical Android device before publishing an APK:

1. Install a fresh debug APK, launch, and verify Lobby, Map, Prepare, Combat, Reward, Recap, Collection, and Settings.
2. Start, save, terminate, then resume an eight-round run; verify no formation or item command can be sent outside Prepare.
3. Verify all controls remain tappable around the notch and system-navigation inset, including bottom-sheet controls.
4. Toggle Vietnamese, sound, haptics, reduced motion, and text scale; restart the app and verify persistence.
5. Record device, Android version, build hash, frame-time percentile, texture memory, and any failures in the release evidence.

The remaining Android evidence requires a physical reference device for install, input, and performance measurements.
