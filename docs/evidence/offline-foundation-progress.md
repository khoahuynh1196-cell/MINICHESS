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
