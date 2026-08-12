# Arena 4x6 source migration plan

**Status:** canonical contract and compatibility boundary complete; device gate open
**Date:** 2026-08-12
**Target:** portrait mobile arena, 4 columns x 6 rows (24 global cells)

## Shipped in this checkpoint

- Four authored board variants share one symmetric 4x6 master geometry.
- Meadow, Ruins, Frost Keep, and Ember Citadel use the same grid and frame
  treatment while changing only the environment theme.
- Manifest keys live under `biomes/*/arena-4x6` plus the shared
  `biomes/shared/arena-4x6-master-v3` key.
- The v3 generated sources are 1024x1300: six logical rows, four equal columns,
  and a dark footer reserved for shop and primary action controls.

## Migration log (2026-08-12)

- Replaced the 4x8 runtime contract with 4x6/24 cells across game-core, server
  commands/snapshots/HTTP, Godot formation, replay, unit projection, and theme
  selection.
- Added one TFT-style perspective projection for cell centers, hit targets,
  health bars, and VFX. The board ends near y=850 in the 1080x1920 portrait
  design, leaving the lower area for shop and two primary actions.
- Generated and symmetry-normalized all four v3 theme assets at 1024x1300.
- Added boundary, asset symmetry, footer reservation, interaction, and visual
  regressions; focused Godot/core/server/typecheck suites are green.

## Canonical 4x6 contract

| Invariant | Value |
|---|---:|
| Columns | 4 |
| Rows | 6 |
| Total global cells | 24 (`0..23`) |
| Enemy half | `0..11` |
| Player half | `12..23` |
| Player formation array | 12 entries |
| Bench array | 8 entries |
| Maximum deploy cap | progression cap <= 8; hard board capacity 12 |

The server remains authoritative. Client commands and replay events carry global
cell IDs; a client must not reinterpret them as local indices.

## Shared presentation contract

- `ArenaProjection` is the only source for board polygons, unit centers,
  camera anchor, texture scale, and the UI bottom boundary.
- Top rows are narrower and bottom rows wider, producing a controlled TFT-like
  perspective without rotating the board or clipping either side.
- The runtime board ends before the portrait footer. Prepare keeps the shop,
  bench, inventory, and two primary action controls below that boundary.
- All four theme textures are distinct manifest assets but have identical
  1024x1300 dimensions and exact bilateral pixel symmetry.

## Verification commands

```text
pnpm --filter @auto-battler/game-core test
pnpm --filter @auto-battler/server test
pnpm --filter @auto-battler/server run typecheck
Godot --headless --path client-godot --script res://test/arena_asset_pack_test.gd
Godot --headless --path client-godot --script res://test/arena_projection_test.gd
Godot --headless --path client-godot --script res://test/prepare_screen_test.gd
Godot --headless --path client-godot --script res://test/prepare_interaction_test.gd
Godot --headless --path client-godot --script res://test/task15_visual_contract_test.gd
```

## Release gate status

- Legacy persisted 4x8 data is explicitly migrated or rejected at the
  repository boundary; see [4x8-to-4x6.md](./migrations/4x8-to-4x6.md).
- Desktop Godot capture and the full 38-script headless suite are green.
- Physical Android export/device QA remains open because this workstation lacks
  Android SDK build-tools, export templates, Java, and a configured `adb`.
