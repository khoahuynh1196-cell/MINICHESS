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

## Mission 1 — Combat playback contract end-to-end (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`.

### Wiring gap closed

- `game-core/src/adventure/view.ts`: fixed `progression.experienceToNext`
  (property does not exist on `ProgressionState`) to read the actual field
  `progression.xpToNext`.
- `game-core/src/index.ts`: added the missing barrel exports for
  `playback.ts`, `snapshot.ts` (`buildAdventureCombatSnapshot` + types),
  `view.ts` (`buildAdventureView` + types), and `protocol.ts`
  (`handleAdventureRuntimeRequest`, `parseAdventureRuntimeRequest`).
- `game-core/src/adventure/session.ts`: added the `view` getter
  `AdventureSession` was missing (`protocol.ts` already called
  `session.view`).
- `game-core/src/adventure/lifecycle.ts`: added `AdventureCombatResultCommand`
  (`RECORD_COMBAT_RESULT`, extends `AdventureCombatOutcome`) and changed
  `recordAdventureCombatResult` from a 5-argument
  `(state, command, outcome, rules, content)` shape to the 4-argument
  `(state, command, rules, content)` shape the test suite already assumed,
  reading outcome fields directly off the command.

### New behavior (Mission 1 gate)

- `AdventureCombatEngine.resolve()` now returns
  `AdventureCombatEngineResult { outcome, playback }` instead of a bare
  outcome (`game-core/src/adventure/engine.ts`).
- `resolveAdventureCombat()` returns `AdventureCombatResolutionResult`
  (`AdventureMutationResult & { playback }`), validates the returned
  playback with `assertAdventureCombatPlayback()` against the exact
  snapshot before any mutation commits, and additionally checks that the
  playback's final event's `payload.winner` and `tick` agree with the
  authoritative `outcome.winner`/`outcome.finalTick`
  (`ADVENTURE_PLAYBACK_WINNER_MISMATCH` / `ADVENTURE_PLAYBACK_TICK_MISMATCH`).
- `AdventureCombatSummary` (`state.lastCombat`) now carries an optional
  `playback` field, so a resolved combat's playback survives in state and
  a retried `RESOLVE_COMBAT` command can return the same playback without
  re-running the engine.
- Retry/idempotency design note: the public `RESOLVE_COMBAT` command
  carries no outcome data, while the persisted `RECORD_COMBAT_RESULT`
  command (derived from the engine's result) does. Both share the same
  `commandId`, so a strict fingerprint-based replay check (as
  `replayAdventureMutation` uses for every other command) would spuriously
  throw `ADVENTURE_COMMAND_ID_REUSED` on a real retry, because the two
  command shapes never stringify identically. `engine.ts`'s
  `checkResolveReplay()` and `lifecycle.ts`'s `checkCombatResultReplay()`
  both use commandId-presence-only checks instead of full-fingerprint
  checks for this reason. Documented as a deliberate, narrow exception —
  every other command family keeps the strict fingerprint check.
- `game-core/src/adventure/protocol.ts`: `AdventureRuntimeResponse` gained
  an optional `playback` field, populated only when the request was
  `RESOLVE_COMBAT`.
- `client-godot/scripts/adventure/adventure_runtime_port.gd`: added a
  `combat_playback_ready(playback: Dictionary)` signal, emitted from
  `accept_response()` when the response carries a valid `playback` object
  (non-empty `combatId`, `events` array); validated before `_view` is
  mutated so a malformed playback rejects the whole response.
- `tools/run-adventure-domain-smoke.mjs`: the scripted fake combat engine
  now returns `{ outcome, playback }` using `createAdventureCombatPlayback`
  instead of a bare outcome object (this script is not currently wired
  into `pnpm run check` — it has no `smoke:domain` script entry in
  `package.json` yet — but was still fixed because it is a real consumer
  of `AdventureCombatEngine` and would otherwise throw the moment it is
  wired up or run manually). Verified manually:
  `node tools/run-adventure-domain-smoke.mjs` → `{"status":"PASS", ...,
  "rounds":8,"revision":29,"saves":30}`.

### Pre-existing bugs fixed incidentally (discovered once the suite could run)

Both were latent because the whole `game-core` test suite could not
compile at baseline, so neither had ever actually been executed:

- `game-core/test/adventure/conservation.test.ts`: the 500-mutation stress
  test's `applyIfLegal` only tolerated rejection messages starting with
  `ADVENTURE_` or containing `capacity`/`destination`. `buyAdventureShopSlot`
  throws the plain-English `"Adventure shop slot is empty"` for a legal
  random rejection (buying an empty shop slot), which is not an
  `ADVENTURE_`-prefixed error by `shop.ts`'s own convention (confirmed: no
  error in `shop.ts` uses that prefix, and `shop.test.ts` already asserts
  on the literal message, so the message itself was not changed). Widened
  the test's tolerance list instead of changing production error text.
- `game-core/test/adventure/lifecycle.test.ts`: `"requires legal selections
  and rejects mismatched rounds"` asserted that `selections: []` is
  rejected, using round 1. Round 1's encounter (`PVE_01`) grants only
  `gold`/`shop_refresh`, which produce zero reward offers, so an empty
  selections array trivially satisfies `selections.length ===
  plan.offers.length` (0 === 0) and never threw. Changed the test to use
  round 3 (`PVE_03`, `normal_item_choice`, one offer) and assert the
  specific `ADVENTURE_REWARD_SELECTION_REQUIRED` error.

### Verification

```
pnpm run check
  rules:check   PASS
  typecheck     PASS (game-core, server)
  game-core test  27 files / 211 tests PASS
  server test     10 files / 142 tests PASS
git diff --check   clean (no whitespace errors)
```

Godot headless suite: 26/39 PASS, 13 FAIL — identical file list to the
Mission 0 baseline (all Mission 7/10 asset-pipeline scope: missing
`vfx-atlas-v1.png`, `battle_controller.gd` compile failures, parse
errors in presenter/interaction test scripts). No regression, no new
failure. `adventure_runtime_port_test.gd` (extended with playback
coverage in this mission) passes.

### Remaining debt / explicitly out of scope for Mission 1

- The 13 pre-existing Godot failures above (Mission 7/10 scope).
- `tools/run-adventure-domain-smoke.mjs` has no `smoke:domain` npm script
  wiring it into `pnpm run check` yet (Mission 5 scope per the execution
  plan's Checkpoint C/E).
- No production 4×8 combat kernel exists yet (`game-core/src/simulation/`
  still only has the legacy `kernel.ts` + `seeded-rng.ts`); this playback
  contract is proven against fake/scripted engines only. Mission 2/3 build
  the real production kernel that will exercise this contract for real.
