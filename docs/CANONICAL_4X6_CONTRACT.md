# Canonical 4x6 contract

This is the active cross-layer contract for the production branch. Historical
`alpha-0.3.0` / 4x8 fixtures are compatibility inputs only.

| Version key | Canonical value |
| --- | --- |
| Ruleset | `production-4x6-0.1.0` |
| Content | `alpha-0.4.0` |
| Asset manifest | `asset-4x6-0.1.0` |
| Board | 4 columns × 6 rows, global cells `0..23` |
| Enemy half | `0..11` |
| Player half | `12..23` (12 formation entries) |
| Bench | 8 entries |
| Shop | 5 slots |
| Initial/max level | 3 / 9 |
| Deployment cap | 8 |

Machine-readable sources:

- `rules/production-4x6-0.1.0/ruleset.json`
- `content/alpha-0.4.0/bundle.json`
- `client-godot/assets/rules/production-4x6-0.1.0.json`
- `game-core/src/rules/board-contract.ts`

Every new server run, save envelope, replay fixture, combat snapshot, and room
protocol must carry compatible version keys. Legacy 4x8 state is never
truncated or shifted implicitly; use [the compatibility mapping](migrations/4x8-to-4x6.md).

## Release evidence

- TypeScript: `pnpm run check` — game-core 115 tests, server 161 tests.
- Godot: all 40 `client-godot/test/*_test.gd` scripts pass, including the Gate 2 stress harness and online session contracts.
- Capture: `tmp/adventure-combat-frame-1080x1920.png` and its JSON sidecar.
- Gate 2 desktop stress: `gate2_stress_test.gd`, peak active pooled effect 1,
  64 reuses across deterministic 8×8 events.
- Android APK export and signature verification pass; physical-device QA remains
  open until a reference device is connected. See
  `docs/evidence/2026-08-12-4x6-capture-and-device-qa.md`.
