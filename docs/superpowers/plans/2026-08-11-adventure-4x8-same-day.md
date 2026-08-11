# Adventure 4x8 Same-Day Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing eight-round Adventure flow use one testable 4×8 board and teach its core actions before the 17:30 cut-off.

**Architecture:** Keep the deterministic TypeScript core and authoritative server as rule owners. Godot renders server snapshots and commands only; the client gains a small tutorial presenter and uses existing manifest board art or a fallback.

**Tech Stack:** TypeScript, Vitest, Fastify, Godot 4.7, GDScript.

## Global Constraints

- Board coordinates are global `0..31`; enemy rows are `0..15`, player rows are `16..31`.
- A player formation has 16 slots and deploys at most eight heroes.
- Preserve existing five-slot shop, items, traits, Unique transformations, eight PvE encounters, deterministic combat, and server authority.
- Do not add online/PvP/authentication scope or production asset work.
- Every behavior change has a failing focused test before implementation.

---

### Task 1: Canonical 4×8 combat geometry

**Files:**
- Modify: `game-core/src/simulation/kernel.ts`
- Modify: `game-core/test/simulation/kernel.test.ts`

**Interfaces:**
- Produces player-safe 4×8 movement, targeting, and position validation for server snapshots.

- [ ] Write tests proving 32 valid cells, no row wrapping across four columns, and deterministic player-to-enemy movement from positions `16..31`.
- [ ] Run the focused kernel test and verify it fails because the legacy 3×8 geometry is still active.
- [ ] Replace hard-coded 3×8 dimensions with the fixed 4×8 geometry and preserve stable event ordering.
- [ ] Run `pnpm --filter @auto-battler/game-core test` and confirm all core tests pass.

### Task 2: Authoritative Adventure formation migration

**Files:**
- Modify: `server/src/application/run-commands.ts`
- Modify: `server/src/application/combat-snapshot.ts`
- Modify: `server/test/formation.test.ts`
- Modify: `server/test/run-commands.test.ts`
- Modify: `server/test/combat-snapshot.test.ts`

**Interfaces:**
- Consumes 4×8 global positions from Task 1.
- Produces a 16-slot player board mapped to global positions `16..31`.

- [ ] Write server tests that accept player destinations `16` and `31`, reject `15` and `32`, and enforce an eight-hero cap.
- [ ] Run those tests and verify the legacy 12-slot mapping fails.
- [ ] Migrate formation storage, command validation, snapshots, fixtures, and all affected assertions to the fixed player half.
- [ ] Run `pnpm --filter @auto-battler/server test` and confirm all server tests pass.

### Task 3: Godot 4×8 board and Adventure tutorial

**Files:**
- Modify: `client-godot/scripts/ui/prepare_screen.gd`
- Modify: `client-godot/scripts/battle_controller.gd`
- Create: `client-godot/scripts/ui/adventure_tutorial.gd`
- Modify: `client-godot/test/prepare_screen_test.gd`
- Create: `client-godot/test/adventure_tutorial_test.gd`

**Interfaces:**
- Consumes server board positions `16..31` and round `1..8`.
- Produces one dismissible tutorial cue per round and a four-column, eight-row rendered board.

- [ ] Write tests for 32 rendered combat cells, 16 player formation cells, a board-art fallback, and the round-1/round-8 tutorial messages.
- [ ] Run focused Godot tests and verify failure before implementation.
- [ ] Render the shared 4×8 layout, remove the missing board asset reference, and add progressive text-only tutorial cues without changing authority.
- [ ] Import once, then run focused Godot tests plus `main_scene_smoke_test.gd`.

### Task 4: Workspace verification and handoff

**Files:**
- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/superpowers/specs/2026-08-11-adventure-4x8-cutline-design.md`

- [ ] Write a test or command-level regression check showing workspace typecheck builds game-core before server resolution.
- [ ] Repair the root check script’s build order without changing package versions.
- [ ] Document the exact Adventure cutline, targeted commands, and deferred production scope.
- [ ] Run `pnpm run check`, focused Godot smoke verification, and `git diff --check`.
- [ ] Commit all approved implementation and documentation on `codex/adventure-4x8-today` at 17:30 Asia/Bangkok, then push that branch.
