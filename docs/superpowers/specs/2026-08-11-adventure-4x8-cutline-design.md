# Adventure 4x8 Same-Day Cutline Design

**Status:** Approved for execution — 2026-08-11

## Goal

Deliver a testable Adventure PvE slice on one 4 columns × 8 rows board before the 17:30 Asia/Bangkok cut-off.

## Fixed rules

- Combat coordinates are global `0..31`, with enemy rows `0..15` and player rows `16..31`.
- The player board stores the 16 deployable cells in global-position order; max deployed heroes remains eight.
- Existing five-slot shop, roll, lock, XP, levels, items, Unique transformations, traits, eight PvE encounters, and authoritative server commands remain the source of truth.
- Godot remains presentation-only. It must not calculate combat, random rolls, rewards, or outcomes.
- The Prepare and Combat surfaces render the same 4×8 geometry. No screen may label or assume 3×8, 4×6, or 12 cells.

## Same-day deliverable

1. Rules, server state, snapshot generation, replay placement, fixtures, and Godot board layout use the fixed geometry.
2. All eight Adventure encounters remain playable through the existing authoritative flow.
3. The client has a progressive, dismissible tutorial cue for rounds 1–8: buy/deploy, roll/merge, traits, Unique, item, positioning, full team, final boss.
4. The client does not attempt to load the missing `combat-board-3x8-atlas-v2.png`; it uses a registered existing biome board texture or a visible fallback.
5. Targeted core, server, and Godot tests run without regressions; `pnpm run check` has a correct build order.

## Explicitly deferred

- Production redraw of heroes, monsters, board art, rigged animation, recorded audio, and VFX.
- New screens/component architecture beyond the smallest changes needed for the cutline.
- Authentication, WebSockets, matchmaking, eight-player rooms, shared PvP pool, MMR, ranking, history, and all live-service infrastructure.
- New gameplay content or balance changes not required to preserve the current Adventure flow.

## Acceptance criteria

- A fresh run can buy, deploy, roll, level, equip, start combat, take rewards, and reach recap over all eight existing PvE rounds.
- Server rejects invalid positions outside `16..31` for player formation; snapshots place player units only in that half of the 4×8 board.
- A Godot smoke test can build Prepare without a missing board-texture error.
- TypeScript typecheck and existing test suites are green after the root check-order repair.

## Risk management

The migration is a compatibility cutline, not a complete production-art release. If a full coordinate migration exposes a combat invariant that cannot be fixed safely before the deadline, preserve deterministic server behavior, document the exact blocker, and commit only independently passing work.
