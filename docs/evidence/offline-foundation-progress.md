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

## Mission 2 — Explicit production 4×8 simulation geometry (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`.

### What already existed

`game-core/src/rules/board.ts` already implements rules-driven,
4×8-correct geometry (`boardRow`, `boardColumn`, `manhattanDistance`,
`orthogonalNeighbors`, `localPlayerIndexToGlobal`, ...) parameterized by
`CompiledRuleset.board.columns/rows` — none of it hardcodes 3 columns.
Checkpoint A1's "[x] Add 4×8 board geometry helpers" in the execution
plan is accurate on this branch. This mission did not need to fix that
layer.

### What was missing

The simulation layer had no geometry abstraction of its own: the only
combat kernel (`game-core/src/simulation/kernel.ts`, legacy/Alpha) hardcodes
`BOARD_CELL_COUNT = 24` and `/ 3`, `% 3`, `± 3` arithmetic throughout
(pathing, neighbor-finding, dash/retreat/knockback row-crossing checks).
Nothing yet forces a future production combat kernel (Mission 3) to take
board shape as an explicit dependency instead of copying that pattern.

### Added

- `game-core/src/simulation/geometry.ts`: `CombatGeometry {columns, rows,
  cellCount}`, `PRODUCTION_4X8_GEOMETRY`, `LEGACY_ALPHA_GEOMETRY`,
  `geometryFromRules()` (derives geometry from any `{board:{columns,rows}}`
  shape — both `CompiledRuleset` and `AdventureCombatSnapshot` satisfy
  this structurally), plus `rowOf`/`columnOf`/`cellAt`/`manhattanDistance`/
  `orthogonalNeighbors`/`horizontalDirection`/`verticalDirection`/`displace`.
  `displace()` is the dash/retreat/knockback primitive: it moves N cells in
  a straight line, clamped at the board edge, and is structurally
  incapable of crossing into an adjacent row/column (it operates on
  `rowOf`/`columnOf` derived from `geometry.columns`, not a hardcoded
  divisor).
- `game-core/test/simulation/production-geometry.test.ts`: corner/interior/
  last-cell neighbor cases (`0→[1,4]`, `5→[1,4,6,9]`, `31→[27,30]`),
  Manhattan distance `0→31 == 10`, player local cell `0` → global `16`
  cross-checked against the compiled production ruleset, a worked example
  showing cell 7 resolves differently under 4-column vs. naive 3-column
  math, knockback/dash/retreat clamping at all four board edges, direction
  helpers, and out-of-bounds rejection. 9 tests, all new.

### Deliberately not touched in this mission

- `simulation/kernel.ts` (legacy 3×8 kernel) — left as-is; it is not
  called from any production path (`engine.ts` only defines the
  `AdventureCombatEngine` port and takes an injected engine — there is no
  built-in production kernel yet). Rewriting it now would be premature:
  Mission 3 introduces the production kernel that actually needs geometry
  injected, and the plan requires parity evidence before altering/deleting
  legacy behavior.
- `adventure/engine.ts`, `adventure/snapshot.ts` — the plan lists these as
  mission files because a production kernel wiring into them normally
  needs geometry: on this branch neither yet has anything to wire (no
  production kernel exists). Left for Mission 3.

### Verification

```
pnpm --filter @auto-battler/game-core run test -- test/simulation
  2 files / 78 tests PASS (includes the pre-existing kernel.test.ts)
pnpm --filter @auto-battler/game-core run test
  28 files / 220 tests PASS
pnpm --filter @auto-battler/game-core run typecheck   PASS
rg -n 'BOARD_CELL_COUNT\s*=\s*24|/\s*3\b|%\s*3\b|\+\s*3\b|-\s*3\b' game-core/src
  every hit is inside simulation/kernel.ts (the named legacy module) or a
  descriptive comment in geometry.ts referencing what it replaces —
  no production path match.
```

## Mission 3 — Production deterministic combat parity (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`.

### What this closes

The audit that started this branch's work found the most severe gap in the
prior (abandoned) attempt at this plan: a "production kernel" that only ever
executed a hardcoded flat magic-damage nuke on skill cast, regardless of the
skill's actual authored effects, and a coverage test that checked primitive
*names* against a string allowlist without checking any primitive actually
executed. `content/alpha-0.3.0/bundle.json` authors 15 distinct effect
primitives across skills, traits, and items (`heal`×5, `shield`×11,
`stun`×2, `dash`×2, `knockback`×1, `summon`×2, `apply_dot`×1, `cleanse`×2,
`slow`×2, `buff_stat`×29, `debuff_stat`×1, `restore_mana`×3,
`damage_reduction`×7, plus `deal_damage`); none of them beyond flat magic
damage executed under the prior attempt.

### Added

- `game-core/src/simulation/production-kernel.ts`: `runProductionCombat()`,
  implementing the full `AdventureCombatEngine` port contract
  (`AdventureCombatEngineRequest → AdventureCombatEngineResult`). Real
  per-tick simulation: target selection for all 11 `EffectTarget` kinds
  (`self`, `locked_target`, `nearest_other_enemy`, `lowest_hp_ally`,
  `adjacent_allies`, `rear_ally`, `nearest_trait_ally`,
  `adjacent_trait_allies`, `all_trait_allies`, `adjacent_enemies`,
  `all_enemies`), movement/pathing on the injected `CombatGeometry`, basic
  attack with crit and physical/magic/true damage mitigation, cast
  start/resolution driven by each hero's *actual compiled skill effects*
  (via the newly exported `compileCombatEffect()`, not a hardcoded nuke),
  and real executors for all 15 effect primitives. Passive triggers
  (`CombatTriggerKind`, all 11 kinds) fire from player-side trait
  breakpoints and equipped items, with `oncePerCombat` /
  `oncePerOwnerPerCombat` / `cooldownTicks` / `holderHeroIds` /
  `thresholdPercent` / `attackCount` runtime state tracked per owner per
  trigger.
- `game-core/src/content/compiler.ts`: exported `compileCombatEffect()`
  (previously private `normalizeEffect()`). Skills are stored uncompiled in
  `CompiledContentBundle.skillsById` (snake_case raw fields) — unlike
  trait/item triggers, which are already normalized during compilation —
  so combat simulation must normalize a skill's effects itself.
- `game-core/test/simulation/production-kernel.test.ts`: 18 tests —
  snapshot/outcome/playback shape, 1,000-repeat determinism, event
  sequence/timing invariants, winner-always-valid across all 8 rounds, a
  static primitive/trigger inventory check, and **one behavioral test per
  primitive** that pits the one real hero whose signature skill uses that
  primitive against a harmless target and asserts the specific observable
  playback event that primitive must produce (e.g. `shield` →
  `SHIELD_APPLIED`, `stun` → `STATUS_APPLIED{kind:"stun"}`, `summon` → a
  `UNIT_SPAWNED{summon:true}` that is later followed by a matching
  `UNIT_DIED` on expiry). `restore_mana` and `retreat` are trait-only in
  this content version, so those two are proven via dedicated 4-hero
  rosters that meet the exact breakpoint count needed
  (`C_MAGE`: H04/H09/H13/H19; `R_RABBIT`: H11/H12/H13/H14). This is
  deliberately stronger than checking that a primitive name is a
  recognized string — a primitive with no executor would fail one of
  these regardless of what its name looks like.

### Numeric interpretation decisions (documented for Mission 9 balance review)

No design doc specifies exact `CombatEffect.baseValue` semantics. Inferred
from the real content and documented in a code comment at the top of
`production-kernel.ts`:
- Everything (stats, hp, damage, heal, shield, mana) stays in the existing
  SCALE=1000 fixed-point space already used by hero `base_stats` and
  `effects/definitions.ts` — never converted to a "display" number
  internally.
- `deal_damage`/`heal`/`shield`/`restore_mana`/`apply_dot` without a
  `scalesWith*` flag: `baseValue` is an absolute SCALE=1000 amount.
- With a `scalesWith*` flag: `baseValue`/SCALE is a coefficient multiplied
  by the referenced stat (e.g. 50% of attack damage).
- `buff_stat`/`debuff_stat` "flat" mode: `baseValue` added directly to the
  stat's own SCALE=1000 value.
- `buff_stat`/`debuff_stat` "percent", `slow`, `damage_reduction`:
  `baseValue`/SCALE is a fraction applied multiplicatively.
- Hero star scaling uses the authored `star_multipliers.two/three` map
  (only `max_hp`/`attack_damage` are present in this content version) —
  not a hardcoded ×2/×4, which is what the abandoned attempt used.

These are architecture-level interpretation choices, not balance tuning;
Mission 9's balance simulation is where the resulting numbers get judged.

### Deliberately not touched in this mission

- `simulation/kernel.ts` (legacy 3×8 kernel) — untouched, not on any
  production path.
- No production kernel is wired as any `AdventureSession`'s *default*
  `combatEngine` yet — `AdventureCombatEngine` is an injected port by
  design, and `runProductionCombat` now fully implements that port and is
  exported from `game-core/src/index.ts` for a caller to inject. Mission 5
  is where `tools/run-adventure-domain-smoke.mjs`'s scripted fake engine
  gets replaced with this real one.
- Enemy-side trait/item triggers: `AdventureCombatEnemyRef` carries no
  `itemIds` and encounters have no team-composition concept, so only
  player-side units accumulate trait/item triggers, matching the snapshot
  contract as authored.

### Verification

```
pnpm --filter @auto-battler/game-core run test -- test/simulation/production-kernel.test.ts
  18/18 PASS (includes a 1,000-repeat determinism loop)
pnpm run check
  rules:check PASS, typecheck PASS, game-core 29 files/238 tests PASS,
  server 10 files/142 tests PASS
rg -n '"H0[1-9]"|"H1[0-9]"|"H20"' game-core/src/simulation/production-kernel.ts
  no matches (no hero-ID branching)
rg -n 'from ["'"'"'].*simulation/kernel' game-core/src/adventure
  no matches (production paths never import the legacy kernel)
```

## Mission 4 — Resumable Adventure combat playback phase (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`.

### Target phase model, implemented

`PREPARE → COMBAT → PLAYBACK → REWARD/COMPLETE → PREPARE/COMPLETE`. Combat
resolution (win or lose) now always lands in `PLAYBACK` first; only an
explicit `ACK_PLAYBACK_COMPLETE` command advances to `REWARD` (win) or
`COMPLETE` (lost to zero health).

### Added / changed

- `game-core/src/adventure/types.ts`: `AdventurePhase` gained `"PLAYBACK"`.
- `game-core/src/adventure/lifecycle.ts`: `recordAdventureCombatResult` now
  sets `phase: "PLAYBACK"` unconditionally (the reward plan is still
  computed eagerly here, same as before — only its *exposure* moved). Added
  `AdventurePlaybackAckCommand` (`ACK_PLAYBACK_COMPLETE`) and
  `ackAdventurePlaybackComplete()`, which requires `phase === "PLAYBACK"`
  and transitions to `REWARD` or `COMPLETE` based on `run.health === 0`
  (no extra state needed — health was already committed by the combat
  result). Idempotent via commandId presence, consistent with
  `checkCombatResultReplay`.
- `game-core/src/adventure/session.ts`: added `ackPlaybackComplete()`,
  mirroring `claimReward()`.
- `game-core/src/adventure/protocol.ts`: `AdventureRuntimeRequest` gained
  `ACK_PLAYBACK_COMPLETE`; `handleAdventureRuntimeRequest` dispatches it to
  `session.ackPlaybackComplete()`.
- `game-core/src/adventure/view.ts`: `pendingReward` is now only included
  in `AdventureView` when `phase === "REWARD"` — during `PLAYBACK` it is
  withheld even though it has already been computed, so a client cannot
  see (or spoil) the reward before acknowledging the combat presentation.
  `lastCombat` (including `lastCombat.playback`) remains visible in every
  phase, since a client restoring mid-`PLAYBACK` needs it to resume the
  presentation without rerunning combat.
- `game-core/src/adventure/validation.ts`: replaced the old strict
  `(phase === "REWARD") === (pendingReward !== undefined)` invariant, which
  is no longer true (a won combat has `pendingReward` set while still in
  `PLAYBACK`), with two directional checks: `REWARD` phase requires a
  pending reward, and a pending reward is only valid during `PLAYBACK` or
  `REWARD`.
- **No changes were needed** to `claimAdventureRoundReward`'s
  `phase !== "REWARD"` guard, `AdventureCombatSnapshot`'s
  `phase !== "COMBAT"` guard, or `AdventureCombatSummary`/persistence
  (`state.lastCombat.playback`, added in Mission 1, already is the
  resumable playback record this mission needed — no new save-schema
  changes were required).
- `tools/run-adventure-domain-smoke.mjs`: inserted an `ackPlaybackComplete`
  call between `resolveCombat` and `claimReward` on every round (any real
  caller now needs this — the smoke tool is exactly the kind of consumer
  that would have silently broken without this update).

### Tests added/updated

- `lifecycle.test.ts`: split the old single-step "combat → REWARD" test
  into an explicit `PLAYBACK` assertion followed by `ACK` (checking both
  idempotent replay of the combat result and of the ACK itself), a new
  test proving `ACK_PLAYBACK_COMPLETE` is rejected outside `PLAYBACK`, and
  updated every downstream reward test to ACK before claiming.
- `session.test.ts`: new test `"resumes PLAYBACK after a restore without
  re-simulating combat"` — resolves combat, restores into a *second*
  session instance sharing the same store and the same injected engine
  (so the call counter is observable across both), asserts the restored
  state is still `PLAYBACK` with the identical `eventLogHash`, retries the
  original `RESOLVE_COMBAT` command against the restored session and
  confirms the engine is not called again, then ACKs and reaches `REWARD`.
  This is the concrete "save during PLAYBACK; restore; assert engine call
  count unchanged and playback hash identical" evidence the mission asked
  for.
- `view.test.ts`: rewrote the reward-visibility test to check both phases
  explicitly — `pendingReward` absent during `PLAYBACK`, present after ACK.
- `protocol.test.ts`: added parsing coverage for `ACK_PLAYBACK_COMPLETE`
  and an end-to-end runtime test (`RESOLVE_COMBAT` → view shows `PLAYBACK`
  with playback attached and no reward → `ACK_PLAYBACK_COMPLETE` → view
  shows `REWARD` with the reward now visible and no playback field).
- `conservation.test.ts`: inserted the ACK step into the combat → reward →
  next-round-shop conservation stress test.

### Verification

```
pnpm run check
  rules:check PASS, typecheck PASS, game-core 29 files/241 tests PASS,
  server 10 files/142 tests PASS
node tools/run-adventure-domain-smoke.mjs
  {"status":"PASS", rounds:8, revision:37, saves:38, ...}
  (revision/saves rose from Mission 3's 29/30 to 37/38 — one extra
  ACK_PLAYBACK_COMPLETE command per round, as expected)
git diff --check   clean
```

### Deliberately not touched in this mission

- Godot side (`client-godot/scripts/adventure/*.gd`): the runtime port and
  controller do not yet know about the `PLAYBACK` phase or emit/consume
  `ACK_PLAYBACK_COMPLETE`. That is Mission 6 scope (Godot Adventure
  runtime boundary).

## Mission 5 — Eight-round headless Adventure via the production engine (2026-08-07)

**Branch:** `antigravity/offline-foundation-hardening`.

### Kernel bug found and fixed while building this mission

Building a real (not fake-outcome) 8-round scripted playthrough is the
first thing that actually *exercises* the production kernel against
realistic content end-to-end, and it immediately surfaced two dimensional
bugs in Mission 3's kernel that made every realistic matchup time out.
Both are fixed in a dedicated commit (`ec3989a`, described above the
Mission 3 section date but landed while working this mission): the
attack/move pacing formula ignored the ruleset's actual tick rate (5x too
slow), and the armor/magic-resist mitigation formula compared armor
directly against `SCALE` instead of the standard `resist/(100+resist)`
curve (crushing ~95% of all damage instead of the intended ~15-20%).
Verified before/after with a controlled 3v2 matchup: previously timed out
at tick 700 with zero kills; now resolves by elimination at tick 181.

### Added

- `tools/run-adventure-domain-smoke.mjs`: rewritten to inject the real
  `runProductionCombat` as `combatEngine` (previously a scripted
  fake-outcome stub). The scripted economy: buys heroes (preferring
  offense-skill heroes — roughly half the roster is pure
  support/utility, so a generic buyer starves DPS), spends leftover gold
  on XP, deploys up to the current board cap, equips every unassigned
  reward item, claims queued hero rewards (selling bench space if
  needed), and always ACKs playback before claiming a reward. A mid-run
  save/restore is verified after round 4 (a second `AdventureSession`
  sharing the same store must restore into `REWARD` phase at round 4).
  The whole script runs twice with the same seed and asserts byte-identical
  final state and per-round outcomes.
- `package.json`: added `smoke:domain` and wired it into `pnpm run check`
  (previously not wired into any script at all).
- A second scripted run, `playToDefeat()`, deploys exactly one hero once
  and never invests further, so the encounter's rising stat multiplier
  guarantees a loss without needing any randomness to decide the outcome
  — this is the deterministic defeat-path proof the mission asked for.

### Honest result: a generic greedy economy does not clear all 8 rounds

The scripted playthrough wins rounds 1-3 convincingly (and round 5 in one
of the explored variants) but loses by round 7 under the current content
balance and kernel numeric interpretation documented in
`production-kernel.ts`. This was not treated as a bug to route around:
several purchasing heuristics were tried (buy-to-cap then XP,
duplicate-priority buying for star merges, XP-rush, offense-hero
prioritization, highest-cost reward selection) and the best one is what
shipped. Squeezing out a guaranteed full clear from here is balance
tuning — Mission 9's explicit scope ("Add deterministic balance
simulation script... produce a report containing pick/use frequency,
win/loss proxies... do not overfit balance from tiny samples") — not an
architecture defect. What this mission needed to prove, and does prove,
is that the pure domain lifecycle correctly drives *real, undoctored*
combat through repeated wins and losses, round after round, via
deterministic scripted decisions, all the way to a legitimate `COMPLETE`.

### Verification

```
pnpm run check
  rules:check PASS, typecheck PASS, game-core 29/241 PASS, server 10/142 PASS,
  smoke:domain PASS:
    run: 7 rounds played (W,W,W,L,L,L,L), final health 0, level 5,
         revision 55, 2 items, 56 saves, deterministic across two full
         identical-seed runs (byte-identical final state and per-round
         outcomes)
    defeatPath: health 0, round 4, phase COMPLETE
git diff --check   clean
```

### Remaining debt

- No generic scripted economy achieves a full 8-round clear under the
  current balance (see above) — flagged for Mission 9, not silently
  hidden.
- `smoke:domain` is wired into `pnpm run check` but not yet into
  `.github/workflows/ci.yml` as a separate named step; it runs as part of
  the existing `pnpm run check` CI step, so it is covered, just not
  separately labeled in CI output.
