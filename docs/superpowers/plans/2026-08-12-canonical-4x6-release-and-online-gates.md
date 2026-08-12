# Canonical 4x6 Release and Online Gates Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 4x6 the only active board contract, safely migrate or reject legacy 4x8 state, produce fresh mobile visual/device evidence, close the remaining Gate 2 release evidence, and only then build the eight-player online path.

**Architecture:** The canonical contract is versioned in one ruleset projection consumed by game-core, server, Godot, content, saves, and replays. Legacy 4x8 state is never reinterpreted silently: a versioned migration converts row-preserving coordinates or returns a typed incompatibility error at repository/API boundaries. Online work starts only after the offline release gates have fresh evidence and uses server-authoritative auth, realtime, matchmaking, and room modules.

**Tech Stack:** TypeScript 5.9, Vitest 4, Fastify 5, Godot 4.7, GDScript, PostgreSQL/Supabase migrations, Redis-compatible presence, Android SDK/ADB.

## Global Constraints

- Canonical board is 4 columns × 6 rows, global cells `0..23`.
- Enemy cells are `0..11`; player cells are `12..23`; player formation storage has 12 entries; bench has 8 entries; deployment cap is 8.
- The active content/rules/asset versions must be explicit and compatible; no silent fallback from legacy 4x8 data.
- Server remains authoritative for combat, RNG, rewards, shop, currency, matchmaking, and room state.
- Existing `alpha-0.3.0` data remains readable only through an explicit compatibility path; new runs use the canonical version.
- Every behavior change starts with a failing focused test and ends with fresh verification evidence.
- Online implementation is gated behind offline migration, capture, Android, and Gate 2 acceptance evidence.

---

### Phase 1: Canonical 4x6 rules and versioning

**Files:**
- Create: `rules/production-4x6-0.1.0/ruleset.json`
- Create: `content/alpha-0.4.0/bundle.json`
- Create: `client-godot/assets/rules/production-4x6-0.1.0.json`
- Create: `game-core/src/rules/board-contract.ts`
- Modify: `game-core/src/index.ts`, `game-core/src/simulation/board.ts`, `game-core/src/content/compiler.ts`
- Modify: `server/src/main.ts`, `server/src/application/run-commands.ts`, `server/src/http/app.ts`
- Modify: `client-godot/scripts/presentation/asset_manifest.gd`, `client-godot/scripts/battle_controller.gd`
- Modify: `README.md`, `docs/GAME_RULES.md`, `docs/CONTENT_CONTRACT.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`
- Test: `game-core/test/rules/board-contract.test.ts`, `game-core/test/content/versioning.test.ts`, `server/test/http.test.ts`, `client-godot/test/ruleset_catalog_test.gd`

**Interfaces:**
- `BOARD_CONTRACT_VERSION = "production-4x6-0.1.0"`.
- `BoardContract` exposes `columns`, `rows`, `cellCount`, `enemyCellCount`, `playerStart`, `playerCellCount`, `benchSlots`, `deploymentCap`, `shopSlots`, `initialLevel`, and `maxLevel`.
- `loadCanonicalBoardContract()` returns a frozen contract; callers do not maintain independent dimensions.

- [x] Write failing tests proving the canonical contract is 4x6/24, new content is `alpha-0.4.0`, and server-created runs expose the canonical version and 12-cell board.
- [x] Run the focused tests and confirm the initial RED because the repository still defaulted to `alpha-0.3.0` and had no production rules file.
- [x] Add the ruleset and content copy with explicit version metadata, preserving the original `alpha-0.3.0` bytes.
- [x] Replace production hard-coded 4x8/legacy version defaults with the shared contract; keep historical fixtures explicitly marked as legacy.
- [x] Update docs and manifest examples so no active documentation calls 4x8 or 3x8 canonical.
- [x] Run core/server focused tests, JSON validation, and `git diff --check`.

### Phase 2: Save/replay compatibility boundary

**Files:**
- Create: `game-core/src/compatibility/legacy-board-migration.ts`
- Create: `game-core/src/compatibility/versioned-state.ts`
- Create: `game-core/test/compatibility/legacy-board-migration.test.ts`
- Modify: `server/src/application/run-commands.ts`, `server/src/http/app.ts`, `server/src/infra/postgres-run-repository.ts`
- Modify: `client-godot/scripts/local_run_store.gd`, `client-godot/scripts/replay_loader.gd`
- Modify: `server/test/http.test.ts`, `server/test/run-commands.test.ts`, `client-godot/test/local_run_store_test.gd`, `client-godot/test/replay_loader_test.gd`
- Create: `docs/migrations/4x8-to-4x6.md`

**Interfaces:**
- `migrateLegacyBoard4x8(board: readonly LegacyCell[], options): MigrationResult` maps legacy player cells `16..31` to 4x6 player cells `12..23` by preserving row/column where possible and rejects occupied rows that cannot fit.
- `readVersionedRunState(input): CanonicalRunState | { kind: "INCOMPATIBLE_LEGACY_STATE"; version; reason }`.
- `loadReplay` rejects a replay whose board schema/version is not explicitly migratable; it never truncates or shifts silently.

- [x] Write failing tests for a valid row-preserving 4x8 → 4x6 migration, an out-of-range/ambiguous legacy board rejection, and a replay with no version metadata.
- [x] Run those tests and confirm the migration API and boundary error initially did not exist.
- [x] Implement the pure migration helper with deterministic mapping and a migration report containing source/target versions.
- [x] Apply the helper at server repository/API read boundaries and Godot local/replay loaders; persist the migrated state only after validation.
- [x] Add idempotency and rollback tests: re-reading canonical state does not remigrate, and rejected state is unchanged.
- [x] Run all compatibility, server, replay, and full TypeScript checks.

### Phase 3: Fresh Godot capture and Android QA

**Files:**
- Modify: `client-godot/tools/capture_adventure_frame.gd`, `client-godot/project.godot`
- Create: `client-godot/tools/capture_adventure_frame_test.gd`
- Modify: `docs/ANDROID_QA.md`, `docs/ADVENTURE_ASSET_STATUS.md`, `docs/DEMO_RELEASE_CHECKLIST.md`
- Create: `docs/evidence/2026-08-12-4x6-device-qa.md`

**Interfaces:**
- Capture command writes a fresh `tmp/adventure-combat-frame-1080x1920.png` and a JSON metadata sidecar containing content/rules/asset versions, board bounds, and timestamp.
- Android QA records install, touch path, FPS/frame-time percentile, texture memory, renderer, device, and build hash; unknown physical-device fields remain explicitly blocked.

- [x] Write a failing harness test proving the capture exits, writes the PNG, and asserts the frame metadata uses 4x6 plus footer-safe bounds.
- [x] Run the harness and capture the initial timeout/failure as the RED evidence.
- [x] Make scene boot deterministic and add a versioned capture metadata sidecar with a bounded launcher timeout.
- [x] Run capture at 1080x1920, inspect the output, and record metadata.
- [x] Locate/verify Godot; export/sign the canonical APK and run API 35 emulator smoke (physical device evidence remains open).

### Phase 4: Gate 2 release evidence

**Files:**
- Modify: `client-godot/scripts/unit_view.gd`, `client-godot/scripts/combat_vfx_pool.gd`, `client-godot/scripts/hero_rig_2d.gd`, `client-godot/scripts/ui/combat_hud.gd`
- Modify: `client-godot/test/animation_priority_test.gd`, `client-godot/test/combat_vfx_pool_test.gd`, `client-godot/test/hero_vfx_manifest_test.gd`
- Create: `client-godot/test/gate2_stress_test.gd`
- Modify: `docs/ADVENTURE_ASSET_STATUS.md`, `docs/evidence/gate-2-combat-presentation.md`

**Interfaces:**
- Stress harness runs deterministic 8v8 playback, measures frame time/texture allocations, and emits a machine-readable result.
- Animation timeline events expose action/release/impact ordering without changing authoritative combat state.

- [x] Write focused tests for release/impact ordering, pooled-node reuse under 8v8 stress, and all 20 authored VFX keys.
- [x] Run focused tests to establish the initial RED for missing timeline/stress evidence.
- [x] Implement only the minimum timeline metadata, pooling instrumentation, and release evidence required by the existing event contract.
- [x] Run the full Godot suite plus stress harness and record actual desktop metrics; do not infer device performance from desktop.
- [x] Replace “open gate” status only for evidence-backed items; leave device gates open because unavailable.

### Phase 5: Online PvP 8-player gates (after Phases 1–4 acceptance)

**Files:**
- Create: `server/src/identity/*`, `server/src/realtime/*`, `server/src/matchmaking/*`, `server/src/rooms/*`
- Create: `server/test/identity/*`, `server/test/realtime/*`, `server/test/matchmaking/*`, `server/test/rooms/*`
- Create: `supabase/migrations/*_online_identity_rooms.sql`
- Modify: `client-godot/scripts/ui/lobby_screen.gd`, `client-godot/scripts/run_api_client.gd`, `client-godot/scripts/screen_router.gd`
- Create: `docs/evidence/gate-3-4-online.md`

**Interfaces:**
- `IdentityService` supports guest creation, refresh rotation, revocation, linking, and deletion.
- `RealtimeSession` supports sequence numbers, ping/pong, server-clock offset, reconnect snapshots, and duplicate-command suppression.
- `MatchmakingQueue` accepts region/mode tickets and returns a cancellable match offer.
- `MatchRoom` is a single-writer eight-seat state machine with lease/fencing token, phase deadlines, idempotent combat IDs, recovery, and results.

- [x] Write failing contract tests for auth, reconnect, queue cancellation, eight-seat filling, room recovery, and duplicate result suppression.
- [x] Run RED tests and verify no online implementation is accidentally reachable from the offline client.
- [x] Implement identity and versioned realtime protocol first; require canonical 4x6/rules/content/asset versions in every room.
- [x] Implement the in-memory matchmaking and room lifecycle with deterministic server authority; Godot Queue/Match HUD now covers queue polling, ready, reconnect, and room status.
- [x] Run multi-client isolation, lease/reconnect chaos, malformed-envelope, duplicate-ticket, and Postgres transaction contract tests.
- [x] Add HTTP rate limiting with retryable 429 responses and security-boundary coverage.
- [x] Add the public `guest_*` to durable UUID migration and a transactional
  adapter resolver contract; keep production wiring disabled until it is
  integrated end-to-end.
- [ ] Wire the Postgres/Redis adapter into the production runtime and run eight-client/bot soak before calling online gates ready.

### Final verification and handoff

- [x] Run `pnpm run check`, all Godot headless tests, capture/stress harnesses, and canonical Android APK export; physical-device and online suites remain gated.
- [x] Verify `git diff --check`, version drift checks, migration reports, and clean staged scope.
- [x] Update all release docs with fresh evidence and explicit blockers.
- [x] Commit and push the dedicated branch; open the PR only after the verification output is captured.
