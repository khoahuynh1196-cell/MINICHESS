# Arena 4×6 source migration plan

**Status:** asset pack complete; source migration is the next controlled change
**Date:** 2026-08-11
**Target:** portrait mobile arena, 4 columns × 6 rows (24 global cells)

## Shipped in this checkpoint

- Four authored board variants share one mirrored 4×6 master geometry, so the
  left and right rails, braziers, separators, and every cell seam are symmetric.
- Theme variants use the same composition and line treatment; only the
  environment color wash changes: Meadow (green), Ruins (violet), Frost Keep
  (blue), and Ember Citadel (red/teal).
- Asset keys are registered in `client-godot/assets/asset_manifest.json` under
  `biomes/*/arena-4x6`, with a shared `biomes/shared/arena-4x6-master-v2` key.
- The generated source is 1035×1520 and contains exactly four columns and six
  logical rows (three enemy rows + three player rows).

## Canonical 4×6 contract

| Invariant | Value |
|---|---:|
| Columns | 4 |
| Rows | 6 |
| Total global cells | 24 (`0..23`) |
| Enemy half | `0..11` |
| Player half | `12..23` |
| Player formation array | 12 entries |
| Bench array | 8 entries (unchanged) |
| Maximum deploy cap | keep progression cap ≤ 8; hard board capacity is 12 |

The server remains authoritative. A client must never reinterpret a 4×6
destination as a local index: command payloads continue to carry global cell
IDs, and replay events carry the same IDs.

## Whole-source migration sequence

### 1. Freeze the contract and add boundary tests

- Add one shared geometry constants module for TypeScript and one presentation
  projection module for Godot; do not duplicate `4`, `6`, `12`, or `24` in
  feature code.
- Add tests for every boundary: `0`, `11`, `12`, `23`, and rejection of `24`,
  plus row-wrap and diagonal-neighbor cases.
- Add a migration fixture that rejects a persisted 16-slot/4×8 board unless it
  is explicitly converted by the migration command.

### 2. Migrate game-core simulation

- Change board constants and side validation in
  `game-core/src/simulation/kernel.ts`.
- Re-check pathing, attack range, knockback, displacement, neighbor selection,
  and row-wrap logic against 4 columns and 6 rows.
- Update the simulation fixtures that currently use player positions `16..31`
  to the equivalent `12..23` positions while preserving event ordering and
  deterministic result hashes only where the fixture contract intentionally
  changes.
- Keep combat rules server-owned; this step must not add client-side rule
  fallbacks.

### 3. Migrate server commands and persistence

- Update formation validation in `server/src/application/run-commands.ts`:
  player destinations become `12..23`; enemy combat positions become `0..11`.
- Change public/resume/snapshot normalization to always expose a 12-entry
  player board. Legacy 16-entry data must be normalized once at the repository
  boundary and never leak through HTTP responses.
- Update combat snapshot validation, PVE encounter positions, and HTTP command
  fixtures. Keep the eight-hero progression cap unless product explicitly
  changes it; reject only cells outside the 12 player slots.
- Add a versioned migration marker so old 4×8 runs cannot silently mix with
  new 4×6 replay records.

### 4. Migrate Godot formation and replay presentation

- Replace the current duplicated 4×8 constants in
  `client-godot/scripts/ui/prepare_screen.gd`,
  `scripts/ui/formation_controller.gd`, `scripts/battle_controller.gd`,
  `scripts/unit_view.gd`, and `scripts/presentation/monster_view.gd` with the
  shared 4×6 contract.
- Render three enemy rows and three player rows; map player UI cells to global
  destinations `12..23` and keep bench targets `0..7` separate.
- Use one perspective projection for board polygons, unit centers, health bars,
  VFX anchors, and hit testing. The projection must keep all 24 cells inside a
  32 px portrait safe gutter at 1080×1920.
- Select `AssetManifest.resolve_arena_4x6_texture(biome)` for the active theme;
  do not stretch one biome texture over another theme.
- Keep the camera anchored to the portrait viewport while preserving replay
  focus metadata, so boss emphasis cannot crop either side of the arena.

### 5. Migrate fixtures, tests, and capture evidence

- Update `prepare_screen_test`, `prepare_interaction_test`, formation boundary
  tests, replay loader fixtures, `task15_visual_contract_test`, and smoke tests
  to assert 12 legal player cells and final destination `23`.
- Add an image-level symmetry check for the four board assets (left/right pixel
  sampling within a small tolerance) and a 1080×1920 capture check for no board
  or unit clipping.
- Run Godot headless tests, game-core tests, server tests, typecheck, and the
  portrait capture harness before any commit.

### 6. Documentation and rollout

- Replace 4×8 references in active docs and release checklists; keep the old
  4×8 plan as historical migration context.
- Commit source migration separately from this asset checkpoint so rollback is
  possible without losing the authored art.
- Push the branch only after the full cross-package suite is green and the
  captured frame visibly shows a centered 4×6 board with matched themes.

## Acceptance checklist

- [ ] No production code contains a hard-coded 4×8/32-slot boundary.
- [ ] Server, core, client, fixtures, and docs agree on `0..23`.
- [ ] Exactly three enemy rows and three player rows render in all four themes.
- [ ] Left/right board geometry is symmetric and no cell/unit is clipped at
  1080×1920 or the 540×960 window override.
- [ ] Legacy 4×8 data is explicitly migrated or rejected; it is never silently
  treated as a 4×6 run.
