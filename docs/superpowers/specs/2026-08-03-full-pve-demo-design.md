# Full PvE Demo Design

**Status:** Approved by user — 2026-08-03

## Goal

Build an original, Android-ready 2D chibi-fantasy auto-battler demo. A player
can complete a deterministic eight-round PvE run against bots and monsters:
choose a formation, buy and combine heroes, equip items, activate traits, see
the battle play out, and receive a clear victory or defeat recap.

The game takes strategic inspiration from the auto-battler genre. It must not
copy TFT names, characters, art, UI layouts, audio, or other protected assets.

## Product Scope

The demo is a single-player offline-first PvE experience for a 1080 x 1920
portrait Android viewport.

### Included

- Lobby, PvE run selection, preparation, combat, reward, recap, collection,
  and settings screens.
- One eight-round run with deterministic bot/monster encounters, a miniboss in
  round four, and a boss in round eight.
- Twenty purchasable heroes, H01–H20, in a shared shop pool; this release has
  no reward-only Unique heroes.
- Five faction/species traits and five class traits matching the checked-in
  roster, five normal rarity tiers, star upgrades, twelve basic items, and six
  existing Unique items.
- Gold, level, XP, shop refresh, lock, buy, sell, bench, board placement,
  item equip, and local run save/resume.
- Original sprites, portraits, board tiles, UI iconography, visual effects,
  sound effects, and haptic cues.
- Godot automated tests, content validation, replay tests, in-game screenshots,
  and Android performance verification.

### Explicitly Deferred

- PvP matchmaking, ranked ladders, social/friends, real-money commerce,
  battle pass, skins, cloud account sync, and live-ops backend.
- Future reward-only Unique heroes H21–H24, including their traits, skills,
  visual profiles, assets, reward candidates, and collection cards. The
  compiler may retain generic eligibility support, but the initial bundle has
  none of these records.

## Player Loop

```text
Lobby -> Select PvE Run -> Prepare -> Lock Snapshot -> Combat -> Reward
  -> Prepare (next round) -> Boss / Defeat -> Run Recap -> Lobby
```

Preparation is the only phase in which the player can change the board, bench,
shop, items, and level. Combat remains authoritative and deterministic; the
Godot client renders combat events and never calculates damage, targets,
rewards, pool mutations, or outcomes.

## Screen Architecture

All primary controls use at least a 44 x 44 logical-pixel target, keep an
8-pixel minimum gap from adjacent controls, reserve display safe areas, and
show text/icon feedback rather than relying on colour alone.

| Screen | Purpose | Fixed content |
| --- | --- | --- |
| Lobby | Enter the demo or inspect owned content | PvE Adventure, Continue Run, Collection, Settings |
| Encounter map | Select or preview the next PvE encounter | Eight nodes, biome art, enemy preview, reward and boss marker |
| Prepare | Make all strategic choices before combat | Header, 3 x 8 board, eight-slot bench, traits, inventory, five-slot shop, action rail |
| Combat | Read the deterministic battle without debug controls | Full board, team health, unit health/mana, trait chips, speed/pause, compact event feedback |
| Reward | Resolve a completed encounter | Gold, item/orb, one-of-three reward selection where configured, Unique-item reveal at round four |
| Run recap | Make the end state understandable and replayable | Win/loss, round reached, hero MVP, traits, combat statistics, retry/home |
| Collection | Browse available content without entering a run | Twenty hero cards, faction/class filters, trait and item codex, Unique-item status |
| Settings | Player comfort controls | Sound, music, haptic, reduced motion, text scale, reset local run |

The Prepare screen uses a compact header; the centre board; then a bottom
interaction sheet containing the bench, shop cards, trait summary, inventory,
and round controls. The sheet is scrollable without allowing the board or
primary action to disappear outside the viewport.

## Visual Direction

### Art rules

- Original chibi fantasy: broad heads, short bodies, rounded silhouettes,
  expressive faces, heavy warm-brown outline, and readable weapons.
- Faction colour is a secondary cue only; role silhouette, weapon, portrait,
  icon, name, and status markers identify units independently of colour.
- UI uses deep navy/indigo backgrounds, dark-stone panels, parchment text
  surfaces, gold economy accents, cyan/green player accents, and coral enemy
  accents. Avoid pure black and uncontrolled glow.
- Board biomes are Meadow, Ruins, Frost Keep, and Ember Citadel. Reuse tile
  kits across encounters to control Android memory use while changing prop,
  ambient-light, and particle layers per biome.
- Hero motion is built from class animation timing: idle, spawn, move, basic
  attack, cast, hit, and death. Every hero gets a distinct sprite silhouette,
  weapon, portrait, cast effect, and ability icon.

### Hero content matrix

The initial roster contains twenty shop heroes, H01–H20. Their rarity, tags,
and visual metadata are content-defined; no reward-only Unique hero is present
in this release.

| Faction | Class coverage | Visual identity |
| --- | --- | --- |
| Catfolk | Guardian, Fighter, Ranger, Mage, Support | warm gold, moonstone, soft fur |
| Dogfolk | Guardian, Fighter, Ranger, Mage, Support | blue enamel, travel leather, banners |
| Rabbitfolk | Fighter, Ranger, Mage, Support | spring green, linen, quick silhouettes |
| Highland cattle | Guardian, Fighter, Support | russet wool, brass, sturdy shields |
| Exotic companions | Guardian, Ranger, Mage | jewel tones, feathers, starlight |

Each hero has one faction/species trait and one class trait. Trait breakpoints
remain defined by the checked-in roster content; future H21–H24 factions,
classes, and traits are deferred.

### Items and rewards

The basic item set contains four offensive, four defensive, and four utility
items. Each has a concise icon, a static stat effect, and one readable combat
effect. Unique rewards are intentionally stronger but use one of a fixed set
of named effects rather than bespoke hardcoded hero logic. A unit can hold two
items, including at most one Unique item.

## PvE Content

| Round | Biome | Enemy count | Intent | Reward |
| --- | --- | ---: | --- | --- |
| 1 | Meadow | 2 | Positioning tutorial | Gold + basic component |
| 2 | Meadow | 3 | Buy and bench decision | Gold + shop refresh |
| 3 | Ruins | 3 | First trait check | Gold + component |
| 4 | Ruins miniboss | 4 | Survivability and Unique-item reveal | Reward choice |
| 5 | Frost Keep | 4 | Enemy affix introduction | Gold + item |
| 6 | Frost Keep | 5 | Build and item check | Reward choice |
| 7 | Ember Citadel | 5 | Full-board formation check | Gold + component |
| 8 | Ember Citadel boss | 6 | Final strategy test | Victory recap |

Enemy compositions, affixes, rewards, shop odds, heroes, traits, skills, and
items are versioned content data. Every record is schema validated before it is
used in a run.

## Technical Architecture

- The existing fixed-point, seed-based combat engine remains the source of
  truth for simulation and replay.
- A content compiler produces validated immutable runtime bundles for hero,
  encounter, pool, trait, item, skill, reward, and presentation data.
- A run-state layer owns all Prepare mutations and local persistence. It emits
  commands to the authoritative run/combat layer and consumes result snapshots.
- Godot presentation is split into screen controllers, reusable HUD widgets,
  board/drag-drop controls, shop/collection cards, and an event-driven combat
  presentation layer.
- Art is packed into texture atlases by biome and class, VFX nodes are pooled,
  and only the current encounter and immediate next UI art are preloaded.
- All gameplay strings live in a localisation catalog; no player-facing names
  are hardcoded inside simulation code.

## Quality Gates

- New content validates with stable IDs, legal ranges, unique pool references,
  and no missing visual/presentation reference.
- Economy, pool conservation, shop odds, star upgrades, item constraints,
  drag/drop validity, save/resume, and deterministic replay have automated
  tests.
- Godot scene smoke tests cover every primary screen and all empty/loading,
  disabled, success, and defeat states.
- The Android build targets a stable 60 FPS on the agreed reference device;
  combat has no allocation spikes from unit sprites or VFX and texture memory
  stays within the device budget established during profiling.
- Delivery includes real screenshots for lobby, Prepare, shop, combat, reward,
  boss, victory, defeat, and collection at portrait resolution.

## Definition of Done

The demo is done when a fresh Android install can start a local run, use every
shop and preparation control, complete or lose all eight encounters, receive
rewards and the Unique-item reveal, resume an interrupted run, view the collection,
and return to the lobby without a debug-only control. All automated tests pass,
the required screenshots are captured, and the art/audio used in the build is
original to this project.
