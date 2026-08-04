# Task 18 — feedback and localisation audit

Base reviewed: `7b75d92` (`fix: animate unique reward reveal`).

## Audit matrix

| Requirement | Existing state | Result |
| --- | --- | --- |
| Sound and haptic settings | `AudioFeedback` already read both settings, but combat-rig SFX bypassed the sound setting. | Added `set_sound_enabled` propagation from controller → unit → rig; disabled sound now suppresses both feedback and combat-rig playback. |
| Approved haptics | Buy, reward, and combine were present; defeat was omitted. | Added defeat cue/haptic. Static call audit confirms exactly buy, combine, reward, and defeat call `request_haptic`. |
| Cue/key diagnostics | Empty cues and missing localisation keys were diagnosed; arbitrary cue IDs were accepted. | Added cue allow-list and unknown-cue diagnostics. Localisation retains English fallback and missing-key diagnostics. |
| English/Vietnamese lookup | Existing JSON catalog and tests covered screen copy plus interpolation. | Verified green; no catalog regression. |
| Hero/shop/reward display IDs | Shop profiles normally supplied names, but unresolved cards and reward hero options could expose `Hxx` IDs. | Hero and reward cards now use human-facing catalog names or `Unknown hero`, never raw hero keys. |
| Loading/error feedback | Only a transient status label existed. | Added `FeedbackOverlay`: labelled loading spinner, visible error banner, focusable Retry button, tooltips, and success clearing. Wired create, resume, and command submission/retry into real routed UI. |
| Audio assets | No checked original audio assets are present under `assets/audio`. | No asset was invented or claimed; existing checked runtime procedural cue path remains in use. |

## TDD record

1. **RED:** `feedback_overlay_test.gd` preloaded a missing overlay. **GREEN:** added and verified the labelled spinner, accessible retry banner, recovery callback, and clear state.
2. **RED:** `audio_feedback_test.gd` accepted `not-a-real-cue`. **GREEN:** added the known-cue allow-list and diagnostics.
3. **RED:** `main_scene_smoke_test.gd` could not find an error banner after an API failure. **GREEN:** wired the overlay to create/resume/command paths and retries.
4. **RED:** `audio_feedback_test.gd` had no observable approved haptic request, then `battle_controller_test.gd` showed defeat emitted none. **GREEN:** recorded accepted haptics for tests and added defeat cue/haptic.
5. **RED:** `reward_screen_test.gd` displayed `H02`; `shop_panel_test.gd` displayed unresolved `H99`. **GREEN:** resolve player-facing hero names with an `Unknown hero` fallback.
6. **RED:** `hero_asset_runtime_test.gd` found no sound-disable API on the rig. **GREEN:** propagated the setting and verified muted combat-rig playback.

## Verification

All passed with Godot 4.7.1 headless:

- `test/audio_feedback_test.gd`
- `test/localization_catalog_test.gd`
- `test/feedback_overlay_test.gd`
- `test/hero_asset_runtime_test.gd`
- `test/reward_screen_test.gd`
- `test/shop_panel_test.gd`
- `test/battle_controller_test.gd`
- `test/main_scene_smoke_test.gd` (scene smoke)
- `git diff --check`

Expected diagnostics were observed in focused tests for intentionally missing/unknown cue/key requests; they are warnings, not test failures.

## Artifacts and concerns

- New implementation artifact: `client-godot/scripts/ui/feedback_overlay.gd`.
- New focused test: `client-godot/test/feedback_overlay_test.gd`.
- No image/audio assets were added or modified.
- Existing unrelated dirty/untracked game/art/import artifacts were left untouched.

## Review follow-up (2026-08-04)

### Findings resolved

| Review finding | Change | Evidence |
| --- | --- | --- |
| P1 — routed UI did not visibly switch language | Localised the active routed Settings screen title, heading, four toggles, language selector, text scale, clear-run and back actions. `BattleController.show_mobile_screen("settings")` applies the current locale before binding settings. | `screen_router_test.gd` starts routed settings in English, invokes the real language action, then asserts `Cai dat`, `Am thanh`, and `Tieng Viet`; it toggles back to avoid persisting test state. |
| P2 — cached resume had no usable retry | `_resume_local_run()` now calls `request_resume_run(cached_run_id)`, sharing loading, error, and retry setup with ordinary resume. | `local_run_store_test.gd` makes cached resume fail, finds an enabled `RetryButton`, clicks it, and proves a second real API resume request was made. |
| P2 — rendered raw IDs remained | Reward tooltips now describe the display choice; unknown hero/item choices use friendly fallbacks. Collection cards, detail headers, and the Unique codex render names only. Prepare and inventory hero fallbacks are also friendly. Internal IDs remain only in node names, signals, and selection state. | `reward_screen_test.gd`, `collection_screen_test.gd`, `shop_panel_test.gd`, and `item_inventory_test.gd` assert no `Hxx`, `Uxx`, or offer IDs in player-facing text/tooltips, including unknown heroes. |

### Review TDD record

1. **RED:** `screen_router_test.gd` could not find the requested localised Settings title and Vietnamese routed strings. **GREEN:** added Settings catalog keys, a locale-aware Settings screen, and controller locale binding.
2. **RED:** `local_run_store_test.gd` found no enabled Retry after a failed cached resume and no second request after clicking Retry. **GREEN:** routed cached resume through `request_resume_run`.
3. **RED:** `reward_screen_test.gd` exposed `H02` and `reward:` in tooltips and exposed `H99` for an unknown hero; `collection_screen_test.gd` rendered `H01`/`H04` and raw Unique IDs. **GREEN:** replaced all rendered values with catalog display names or friendly fallbacks.

### Review verification

- Focused RED/GREEN tests above all passed after implementation.
- Full Godot suite: every `client-godot/test/*_test.gd` passed under Godot 4.7.1 headless, including `main_scene_smoke_test.gd`.
- `git diff --check` passed.
- Static haptic audit still lists only buy, combine, reward, and defeat request sites.
