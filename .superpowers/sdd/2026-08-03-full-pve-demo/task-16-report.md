# Task 16 — combat HUD, VFX, camera, and recap

Base commit audited: `d26d259` (`fix: compact combat board notice`).

## Audit and requirement matrix

| Requirement | Audit finding | Result / evidence |
| --- | --- | --- |
| Pause, 1x, and 2x replay controls | `battle_controller.gd` already had buttons and local scheduler speed/pause state, but no reusable HUD contract or tests. | `CombatHud` owns the three controls and emits only presentation requests; `combat_hud_test.gd` verifies pause and 2x. Controller continues to advance only the scheduler. |
| Accessible event labels | No prior event-announcement UI was found. | `CombatHud.present_event` provides visible and tooltip-mirrored readable announcements. Focused test checks `DAMAGE_APPLIED`. |
| Pooled VFX + floating combat text | `CombatVfx2D` existed but self-freed and was created per hero-rig effect; no reusable pool or event router existed. | `CombatVfxPool` reuses `CombatVfx2D` instances, adds `FloatingCombatText`, and routes damage/heal/shield/CC events. `combat_vfx_pool_test.gd` verifies reuse and every route. |
| Reduced motion | Unit/rig reduced motion already existed. VFX did not consume it. | Controller forwards the existing setting to `CombatVfxPool`; pooled VFX set duration to `0.0` while retaining the server event and readable text. Focused test covers it. |
| Cast/boss camera emphasis | No combat camera existed. | `CombatCamera` focuses on an enemy boss spawn and cast source, with only Camera2D position/zoom changed. Focused test proves hero HP is unchanged by cast emphasis. |
| Authoritative recap data | A legacy recap calculated copy from `run_state.round` and `run_state.health`; it did not accept the required recap record. | `RunRecapScreen.bind_snapshot` accepts exactly `winner`, `round`, `mvp`, `damageByHero`, `healByHero`, and `activeTraits`; it renders without deriving outcome/stat totals/traits/rewards. Victory and defeat copy are tested. |
| Approved art only | Existing `AssetManifest`/`CombatVfx2D` manifest behavior was retained. | No card atlas was added or routed into runtime. |

## TDD record

1. **RED:** added `combat_hud_test.gd` and `combat_vfx_pool_test.gd`; Godot failed with the expected missing preloads for `combat_hud.gd`, `run_recap_screen.gd`, and `combat_vfx_pool.gd`.
2. **GREEN:** added the minimal HUD, recap, pooled VFX, and reusable `CombatVfx2D` lifecycle. Both focused test scripts passed.
3. **RED:** extended `combat_hud_test.gd` with boss/cast camera and controller-to-pool routing. It failed because `CombatCamera`/`camera_focus_position` were absent.
4. **GREEN:** integrated the presentation objects in `battle_controller.gd`; the focused tests passed.

## Verification

- `git diff --check` — passed.
- Headless main scene: `Godot_v4.7.1-stable_win64_console.exe --headless --path client-godot --quit-after 2` — exit `0`.
- Full Godot test sweep: all **30** `client-godot/test/*_test.gd` scripts passed, including the two new focused tests.

The main-scene smoke run emitted existing Skeleton2D bone-layout warnings and the expected informational unsupported `COMBAT_STARTED` message; neither failed the process or tests.

## Runtime captures

No capture is claimed. A desktop runtime was launched, but the automation surface reported two indistinguishable pre-existing `Auto Battler 2D Alpha (DEBUG)` windows. To avoid interacting with or misattributing another runtime, no screenshot was captured. Consequently, there are no combat/victory/defeat capture artifacts from this task, and no Android/native QA claim.

## Commit and remaining gates

- Commit: `feat: add combat HUD VFX and run recap` (this report is included in that commit).
- Remaining gate: capture real combat, victory, and defeat states in an unambiguous runtime; capture resolution/provenance must be recorded and desktop/non-native captures must not close Android/native QA.
