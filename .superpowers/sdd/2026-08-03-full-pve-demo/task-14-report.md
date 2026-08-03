# Task 14 art-pack report

## Deliverables

- `client-godot/assets/asset_manifest.json` — versioned `godot-atlas-manifest/v1` contract with 252 real asset records, 20 visual profiles, 18 item icons, four biome kits, and six Unique transformations.
- `client-godot/assets/heroes/hero-roster-atlas-v1.png` — 19-character roster atlas; `client-godot/assets/heroes/h20-capybara-guardian-v1.png` supplies the twentieth roster member.
- `client-godot/assets/items/item-vfx-ui-atlas-v1.png` — normal/Unique item icons plus UI and VFX source tiles.
- `client-godot/assets/biomes/board-kits-atlas-v1.png` — meadow, ruins, frost keep, and ember citadel boards.
- `client-godot/assets/vfx/vfx-atlas-v1.png` and `client-godot/assets/ui/navy-gold-ui-atlas-v1.png` — runtime-addressable copies of the VFX/UI source atlas.

The source-only `artifacts/hero-2d-vfx-pack` handoff was inspected for context but is not referenced by the manifest or runtime paths.

## Animation policy

Each bundle state (`idle`, `move`, `basic_attack`, `hit`, `skill_cast`, `death`) resolves to a real texture-atlas region with a declared six-frame, 120ms hold sequence. This is intentional launch-pack metadata: behavior may add transforms or richer replacement frames without changing the bundle-facing key contract.

## Generator

Built-in image generation was used (no fallback CLI). Final workspace paths are listed above.

### Hero roster prompt

`Create one cohesive 5 columns by 4 rows character roster sheet containing exactly twenty distinct full-body chibi fantasy adventurers... original character designs, no existing game characters or franchises... warm dark cocoa outlines, large readable silhouettes, painterly cel shading, mobile RPG clarity... navy and antique gold UI accents... no letters, names, watermarks, or brand marks.`

### H20 prompt

`An original full-body chibi capybara guardian adventurer in teal and antique-gold plated armor holding a broad round shield and small lantern staff... polished hand-painted 2D chibi fantasy game art, warm cocoa ink outlines... no text, logos, watermark, or other characters.`

### Item/VFX/UI prompt

`Create a clean 6 columns by 4 rows atlas of twenty-four distinct readable game icons: twelve normal items, six mythical artifacts, two navy-gold UI crest panels, and four magical effect emblems... hand-painted chibi fantasy RPG icon art, warm dark cocoa outline... exact 6x4 grid, no words, logos, watermarks, or recognizable franchise branding.`

### Biome prompt

`Make a 2 columns by 2 rows sheet of four distinct empty top-down/isometric fantasy tactical board environments: sunny meadow, moonlit ancient ruins, frost keep, ember citadel... hand-painted chibi fantasy game environment, warm dark outlines, readable board lanes, navy and antique-gold UI edge accents... exact 2x2 grid, no text, logos, watermarks, or characters.`

## Verification

- Added the manifest contract test first; it failed before the manifest existed, then passed after the real asset registration.
- `pnpm test -- alpha-bundle.test.ts` passed: game-core 100 tests and server 140 tests.
- A direct `res://` manifest path scan reported `assets: 252`, `profiles: 20`, `missing: []`.
- Visual inspection completed at native resolution for the hero roster, item/VFX/UI atlas, and four-board biome atlas.

## 2026-08-04 cutout-runtime correction

The card-style hero roster and monster HUD atlases listed above are rejected
references, not runtime inputs. `asset_manifest.json` now maps H01–H20 through
their individual `assets/sprites/h01-...` through `h20-...` alpha cutouts;
`UnitView` and `HeroRig2D` resolve them through `AssetManifest` rather than a
hard-coded portrait table. The manifest contains no
`hero-roster-atlas-v1.png` or `monster-hud-vfx-atlas-v2.png` runtime path.

`MonsterView` is a reusable manifest consumer, used for `side == "enemy"`
spawns in `BattleController`. It owns the ground ellipse, HP bar, nameplate,
defeat tint, and an elite/boss marker in Godot code; no UI or status pixels are
baked into monster art. Board dimensions and replay event semantics were not
changed.

### Monster source inventory

- Ten distinct generated, chroma-removed alpha cutouts are present under
  `client-godot/assets/monsters/`: four normal biome enemies, four elites,
  Meadow's Briar King boss, and Ruins' Lich Archivist boss.
- Six explicit manifest records remain
  `engine_marker_over_base_pending_cutout`: Frost boss/family and Ember
  boss/family plus Meadow/Ruins boss-family. They are registered and visibly
  tier-marked at runtime, but do **not** satisfy the strict requirement for
  sixteen distinct monster source cutouts. This is an open art-production gap,
  not a passed acceptance gate.

### Verification run

Godot 4.7.1 console executable:

`C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.1-stable_win64_console.exe`

- `--headless --path D:\CODE\client-godot --editor --quit` imported all ten
  monster PNGs successfully through the mobile project configuration.
- `--headless --path D:\CODE\client-godot --script res://test/asset_manifest_test.gd`
  passed, including all H01–H20 and all sixteen declared monster IDs.
- `--headless --path D:\CODE\client-godot --script res://test/monster_view_test.gd`
  passed.
- `--headless --path D:\CODE\client-godot --script res://test/battle_controller_test.gd`
  passed, including an enemy `MonsterView` spawn that resolves the Meadow
  cutout.
- `--headless --path D:\CODE\client-godot --script res://test/unit_view_animation_test.gd`
  passed.

### Open capture gate

A dedicated `SceneTree` capture helper was attempted twice with the same
Godot console invocation. Both runs timed out at 64 seconds before producing
a viewport frame, so no screenshot was retained and no visual-inspection claim
is made for a 1080 × 1920 live combat capture. Capture should be performed
from an interactive or device-backed Godot run before the full visual
acceptance gate is signed off.
