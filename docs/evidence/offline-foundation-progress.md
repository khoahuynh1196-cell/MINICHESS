# Offline Foundation Progress Evidence

**Branch:** `codex/gate-0-canonical-rules`  
**Pull request:** #3  
**Status:** Active implementation; not release-ready

## Implemented foundation

### Canonical contracts

- Authored `production-rules-0.1.0` with 4×8 board, five-slot shop, level 3–9 progression, roster/item limits, Adventure economy, Standard economy, and rules-driven PvE loss damage.
- Deterministic rules hash: `c13ef1c6fb09d7e61fa5955ec7cca38b6a58a33643d89bdaca399b1926e7d548`.
- Release manifest locks rules, content, asset revision, and client save schema.
- Content/rules compatibility and generated Godot-rules drift checks.

### Pure Adventure domain

- Immutable board/bench/item state and invariant validation.
- Deterministic hero movement, swap, sale, item return, 2-star/3-star merge, and Unique transfer.
- Immutable shared shop pool with deterministic rolls and copy conservation.
- Rules-driven gold, XP, level, board cap, shop odds, and refresh behavior.
- Revisioned/idempotent command reducer.
- Deterministic reward plans including one-of-three Unique selection.
- Combat → reward → prepare/complete lifecycle with rules-driven health loss.
- Hero reward queue and pool reservation.
- Full-state copy-conservation validator.
- Checksummed save/restore with release and asset compatibility checks.
- Atomic persistence recovery: failed writes do not publish state, and retry does not rerun combat.
- Presentation-safe view projection that excludes seed, pool, and command receipts.
- Immutable 4×8 combat snapshot and injected combat-engine port.
- Offline `AdventureSession` orchestration over storage and combat ports.

### Automated coverage added

Focused tests exist for:

- Rules compiler, board geometry, progression, economy, release compatibility, and content compatibility.
- Roster movement/merge, items, shop pool, reducer, rewards, lifecycle, engine port, save, session, snapshot, view projection, and conservation stress.
- Eight-round domain smoke runner: `pnpm run adventure:domain-smoke`.
- Root `pnpm run check` now includes rules drift, typecheck, domain smoke, and package tests.

## Fresh focused verification performed during implementation

The controller environment could not clone the private repository or surface GitHub Actions runs. A strict isolated TypeScript harness was therefore used for focused compile/runtime evidence.

Fresh successful checks included:

- Rules compiler/runtime smoke and SHA-256 rules hash verification.
- Immutable roster move/swap/2-star/3-star merge runtime smoke.
- Shop/item/reducer chain runtime smoke.
- Combat/reward lifecycle runtime smoke: revision `5`, phase `PREPARE`, round `2`, gold `12`.
- Checksummed save/restore runtime smoke.
- Engine idempotency smoke: repeated `RESOLVE_COMBAT` called the injected engine once.
- Session persistence smoke, including failed-save recovery without rerunning combat.

These focused checks are not substitutes for the full repository test suite.

## Evidence not yet available

Do not claim any of the following yet:

- Full `pnpm run check` on the actual private branch.
- Complete Vitest count or zero-failure report from CI.
- Full Godot headless suite after all changes.
- Production 4×8 combat simulation. The current legacy kernel still contains 3×8 assumptions and is isolated behind the new engine port.
- A playable Godot vertical slice using the new Adventure session/view boundary.
- Android install, physical-device input, frame-time, memory, or Google Play evidence.

## Current load-bearing debt

1. Implement or migrate a production combat engine that consumes `AdventureCombatSnapshot` and obeys 4×8 geometry.
2. Produce presentation-complete combat event timing and replay data.
3. Expose the Adventure session through a Godot-compatible runtime adapter without duplicating gameplay rules.
4. Replace the Godot God-object controller with scene/presenter boundaries.
5. Migrate saves/UI to the versioned Adventure view and command contracts.
6. Remake assets, animation, VFX, and audio after combat timing is stable.

Online identity, matchmaking, ranked, seasons, Redis, and production server scale remain intentionally deferred.

## Antigravity preflight (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`, created from `origin/codex/gate-0-canonical-rules` @ `3174a8b`.

This section records the factual state of this exact commit before any Antigravity change. No failure below was fixed as part of this preflight step.

### `pnpm run rules:check`

FAIL. `node tools/export-client-ruleset.mjs --check` reports the committed
`client-godot/assets/rules/production-rules-0.1.0.json` as stale versus the
authored ruleset. Diffing the regenerated output against the committed file
shows no semantic difference — only JSON array formatting (inline vs
one-value-per-line). Values (shop odds, progression, etc.) are identical.
Root cause not yet investigated; likely a serialization change in the export
tool without regenerating the committed artifact.

### `pnpm --filter @auto-battler/game-core run typecheck`

FAIL — 17 errors. The `adventure/playback.ts` contract (commit `8d015ba`)
was added but never fully wired through the rest of the module:

- `src/adventure/protocol.ts:135` — `AdventureSession` has no `view` property.
- `src/adventure/view.ts:104` — `ProgressionState` has no `experienceToNext`.
- `src/index.ts:59` — imports non-existent `AdventureCombatResultCommand`
  from `lifecycle.ts` (actual export is `AdventureCombatResolutionCommand`).
- `src/index.ts` does not export `assertAdventureCombatPlayback`,
  `createAdventureCombatPlayback`, `validateAdventurePlaybackEvents`,
  `AdventureCombatSnapshot`, `AdventurePlaybackEvent`,
  `handleAdventureRuntimeRequest`, `parseAdventureRuntimeRequest`,
  `buildAdventureCombatSnapshot`, or `buildAdventureView`, all of which
  `game-core/test/adventure/*.test.ts` already imports.
- `AdventureCombatEngineRequest` has no `state` property that
  `test/adventure/session.test.ts` reads.
- `test/adventure/lifecycle.test.ts` calls a helper with 4 arguments where
  the current signature requires 5.

### `pnpm --filter @auto-battler/game-core run test` (vitest run directly, bypassing the `pretest` build gate)

FAIL — 7 test files / 26 tests fail out of 27 files / 209 tests. All
failures trace to the same wiring gap above: `buildAdventureCombatSnapshot`,
`buildAdventureView`, and `handleAdventureRuntimeRequest` are not exported
or not implemented as callable functions, and
`AdventureCombatEngineRequest` does not carry `state.run` for the fake
engines used in `session.test.ts` and `playback.test.ts`.

### `pnpm --filter @auto-battler/server`

PASS. `tsc --noEmit` clean; 10 test files / 142 tests pass.

### Godot headless suite (Godot 4.7.1, `client-godot/test/*_test.gd`)

26 / 39 PASS. 13 FAIL, all pre-existing and unrelated to the TypeScript
gap above:

- Parse errors: `adventure_presenter_test.gd`, `prepare_interaction_test.gd`.
- `battle_controller.gd` itself fails to compile ("Compilation failed"),
  which cascades into `battle_controller_test.gd` and
  `main_scene_smoke_test.gd`.
- Compilation failures (script-level, cause not yet isolated):
  `hero_asset_runtime_test.gd`, `hero_vfx_manifest_test.gd`,
  `mobile_ui_accessibility_test.gd`, `prepare_screen_test.gd`,
  `task15_visual_contract_test.gd`, `unit_view_animation_test.gd`.
- Missing/unloadable asset `res://assets/vfx/vfx-atlas-v1.png`:
  `asset_manifest_test.gd`, `combat_vfx_manifest_test.gd`,
  `monster_view_test.gd` (the last also hits a null-texture access after
  the missing-asset error).

### Baseline conclusion

Mission 1 (finish the combat playback contract end-to-end) is not a
greenfield mission — it must first close the wiring gap above before any
new behavior is added, because the playback contract's consuming code
(`protocol.ts`, `index.ts`, `session.ts`, `view.ts`) does not currently
compile against its own test suite. The Godot God-object compile failures
are Mission 7 scope and are not blocking for Missions 1–5 (pure
TypeScript domain work).
