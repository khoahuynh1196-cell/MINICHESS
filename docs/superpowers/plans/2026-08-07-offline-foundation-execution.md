# Offline-First Auto-Battler Foundation Execution Plan

**Status:** In progress  
**Branch:** `codex/gate-0-canonical-rules`  
**Priority:** A durable playable single-player foundation; identity, matchmaking, ranked, seasons, and scale remain deferred.

## Non-negotiable contracts

- H01–H20 and U01–U06 remain the launch roster and transformation set.
- Production board is 4 columns × 8 rows; enemy global cells are `0..15`, player global cells are `16..31`.
- Player-owned formation storage has 16 local cells.
- Shop has 5 slots; bench has 8 slots; a hero has at most 2 items; a team has at most 1 Unique.
- Progression begins at level 3, caps at level 9, and deployment caps at 8.
- Simulation, run mutation, rewards, and replay remain deterministic and data-driven.
- Godot presents authoritative state and events; it must not invent combat outcomes.
- Legacy `alpha-0.3.0` meaning is preserved until an explicit migrated content version replaces it.
- No UI/art work may introduce new hardcoded game rules.

## Checkpoint A — Canonical rules foundation

### A1. Authored and compiled rules

- [x] Create `rules/production-0.1.0/ruleset.json`.
- [x] Add canonical SHA-256 hashing.
- [x] Add strict rules types and compiler.
- [x] Add 4×8 board geometry helpers.
- [x] Add rules-driven progression and shop-odds helpers.
- [x] Add rules-driven Adventure and Standard income helpers.
- [x] Add content/ruleset compatibility inspection.

### A2. Client projection

- [x] Export the authored rules to Godot.
- [x] Add generated-file drift checking to `pnpm run check`.
- [x] Add Godot ruleset loader and board layout helpers.
- [x] Add focused TypeScript and Godot tests.

### A3. Remaining acceptance work

- [ ] Obtain fresh full TypeScript and Godot suite evidence.
- [ ] Record verification evidence without claiming unsupported device results.
- [ ] Review and merge the rules-foundation PR only after checks pass.

## Checkpoint B — Rules-driven deterministic combat

- [ ] Add explicit board geometry to production combat snapshots.
- [ ] Preserve legacy Alpha replay interpretation through a named legacy adapter only.
- [ ] Replace all `/3`, `%3`, `±3`, and 24-cell assumptions in production pathing, targeting, displacement, summon placement, and adjacency.
- [ ] Read tick rate and maximum ticks from the compiled ruleset.
- [ ] Add golden 4×8 pathfinding, movement, knockback, dash, retreat, summon, and deterministic replay tests.
- [ ] Add presentation timing fields without changing outcome authority.

**Gate:** identical production snapshot/rules/seed yields identical events and result hash; no production combat path defaults to legacy geometry.

## Checkpoint C — Pure Adventure domain

Create focused modules under `game-core/src/adventure/`:

- `types.ts`: immutable run, hero instance, item instance, shop slot, phase, command, and result contracts.
- `progression.ts`: rules-driven gold, XP, level, cap, and round advancement.
- `roster.ts`: board/bench movement, sale, merge, item return, and capacity invariants.
- `shop.ts`: deterministic five-slot rolls and shared-pool accounting.
- `items.ts`: equip/unequip and Unique limits.
- `rewards.ts`: deterministic offers, materialization, and one-time claim.
- `reducer.ts`: pure command application with revision and idempotency.
- `snapshot.ts`: immutable combat snapshots from run/content/rules.
- `recap.ts`: authoritative damage/heal/shield/MVP summary.

- [ ] Extract behavior from the current server application without changing player-visible semantics.
- [ ] Give every command a red/green focused test.
- [ ] Add property tests for pool conservation, merge copy conservation, item return, command replay, reward replay, and board legality.
- [ ] Keep HTTP/Postgres as adapters around the pure domain, not owners of game rules.

**Gate:** an eight-round Adventure can run headlessly from creation through victory/defeat using only pure domain APIs and deterministic combat.

## Checkpoint D — Content gameplay hardening

- [ ] Create a versioned production-compatible content release instead of mutating Alpha meaning.
- [ ] Validate all 20 heroes, skills, 10 traits, 12 normal items, 6 Unique items, 6 transformations, 8 encounters, visual keys, animation keys, and localization keys.
- [ ] Replace passive stat-only traits where a clear species behavior is required.
- [ ] Guarantee no hero/item/trait logic branches on a hero ID.
- [ ] Add balance simulation reports with seed, sample size, placement/win assumptions, and caveats.

**Gate:** every content record compiles, is reachable under the ruleset, has presentation references, and executes through generic primitives.

## Checkpoint E — Godot architecture migration

- [ ] Introduce `.tscn` screens for Boot, Home, Prepare, Combat, Reward, Result, Collection, and Settings.
- [ ] Add `AppController`, `AdventurePresenter`, `PreparePresenter`, `CombatPresenter`, `RewardPresenter`, `AssetResolver`, and endpoint/runtime adapters.
- [ ] Migrate formation to the generated 16-cell player board contract.
- [ ] Migrate save schema with explicit ruleset/content/asset versions; reject incompatible saves safely.
- [ ] Retire `battle_controller.gd` only after parity tests pass.
- [ ] Remove production debug copy and controls.

**Gate:** a user can complete or lose Adventure without developer input, with every visible control functional or explicitly disabled with a reason.

## Checkpoint F — Combat presentation and asset system

- [ ] Define action/start/release/impact/death timing in event presentation data.
- [ ] Add actor state priority: Death > hard control > hit > cast > attack > move > idle.
- [ ] Add pooled projectile, VFX, damage number, status, and camera systems.
- [ ] Separate board visual, shop portrait, collection portrait, ability icon, rig parts, transformation overlay, and VFX keys.
- [ ] Remake H01–H20, four biome sets, monsters, UI kit, VFX, SFX, and music through one manifest pipeline.
- [ ] Add missing-asset failure tests and safe production fallback.

**Gate:** HP, impact, status, and death presentation follows authoritative events, and combat remains readable on a phone-sized viewport.

## Checkpoint G — Offline vertical slice and Android gate

- [ ] Fresh install → Home → Adventure → Prepare → Combat → Reward → Boss → Result → Replay.
- [ ] Save/resume from Prepare, Combat playback, and Reward.
- [ ] Win and defeat paths both return to a stable result/home flow.
- [ ] Build signed Android test artifact and run emulator plus physical-device checks.
- [ ] Capture frame time, memory, input, aspect-ratio, text-scale, and crash evidence.
- [ ] Produce release checklist and known-debt ledger.

**Gate:** complete 15–25 minute Adventure session on Android with no manual server setup exposed to the player and no critical gameplay, save, input, or presentation defect.

## Deferred after foundation

- Account and cloud save.
- WebSocket and reconnect protocol.
- Matchmaking and eight-player rooms.
- Ranked, seasons, leaderboard, achievements, and anti-cheat.
- Commercial live-service scale.

The deferred systems may reuse the deterministic domain, rules/content versions, snapshots, events, and presenters, but may not reshape them before the offline gates are accepted.
