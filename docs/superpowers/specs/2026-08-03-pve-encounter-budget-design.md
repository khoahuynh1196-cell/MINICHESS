# PvE Encounter Budget Design

**Status:** Approved by user delegation — 2026-08-03

## Decision

Each of the eight Alpha encounters declares an `enemy_composition` in the
versioned content bundle. A unit references an existing hero ID, has a unique
enemy-side grid position (`0..11`), and uses an integer `stat_multiplier`
(`SCALE = 1000`). This avoids duplicated combat stats and lets balance changes
remain content-only.

Round five also declares one simple stat affix. Its `value` is a fixed-point
**bonus** added to `SCALE`: `150` means enemy attack speed is multiplied by
`(1000 + 150) / 1000` (a 15% increase). It is resolved by the
content-to-combat adapter, not by HTTP or the Godot client.

## Progression

| Round | Units | Stat multiplier | Role |
| --- | ---: | ---: | --- |
| 1 | 2 | 550 | Position tutorial |
| 2 | 3 | 700 | Three-unit check |
| 3 | 3 | 900 | Elite shield/CC check |
| 4 | 4 | 1,100 | Boss DPS/survival check |
| 5 | 4 | 1,200 + 150 AS affix | Enemy-affix introduction |
| 6 | 5 | 1,350 | Trait/build check |
| 7 | 5 | 1,550 | Frontline/backline check |
| 8 | 6 | 1,800 | Final build check |

Each composition uses existing public hero IDs and positions only in the enemy
half of the 3×8 shared grid. No player item, Unique, tenant, or random seed is
stored in encounter content.

## Validation

The content compiler must reject an encounter with an empty composition,
missing hero reference, duplicate/out-of-range position, invalid multiplier, or
an affix outside the allowed fixed-point range. Alpha bundle tests verify all
eight consecutive encounters, scaling progression, and exactly one round-five
affix.

## Deferred integration

The subsequent server adapter translates this immutable encounter data plus a
locked player snapshot to `CombatUnit` values. It is responsible for derived
stats, seed generation, replay events, rewards, and lifecycle transitions.
