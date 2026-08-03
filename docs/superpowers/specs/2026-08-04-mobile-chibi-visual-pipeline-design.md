# Mobile Chibi Visual Pipeline Design

**Status:** Approved direction A by user — 2026-08-04. Implementation is
pending review of this written specification.

## Purpose

Replace the rejected presentation art with an original, game-ready 2D chibi
fantasy visual system for the Android PvE demo. The user's supplied character
sheet is a style reference only: it establishes broad heads, short bodies,
thick warm outlines, simple expressive faces, and readable weapons. No
characters, poses, frame design, source pixels, names, or composition are
copied from it.

The former `hero-roster-atlas-v1.png` and `monster-hud-vfx-atlas-v2.png` are
not valid gameplay sprite sources: their parchment/navy card backgrounds and
gold borders are baked into each character. They may not be cropped or
registered as final combat, monster, VFX, or HUD art.

## Non-negotiable visual contract

Every gameplay asset is a composable layer:

| Layer | Delivery | May contain | Must not contain |
| --- | --- | --- | --- |
| Hero or monster | alpha PNG cutout, packed in a runtime atlas | one fully visible character, own weapon, optional self-contained cast glow | card edge, rectangle, scene backdrop, UI frame, text, baked HP bar, baked shadow |
| Ground shadow | engine-rendered soft ellipse or independent alpha sprite | neutral contact shadow | character pixels, UI |
| Board / biome | separate tile, prop, and ambient layers | terrain and environmental detail | unit art, HP bars, card panels |
| UI and HUD | Godot controls plus icon-only alpha sprites | economy/status icons, named controls, rarity treatment | characters or monsters baked into a card |
| VFX | alpha sprite/particle layer | a single legible effect | UI border, character portrait, card background |

If generation cannot create alpha directly, the source may use one flat
chroma-key background only. It is removed before atlas packing; the shipped
PNG has alpha and no chroma pixels at its exposed edge.

## Chibi character grammar

- Original 2D chibi fantasy, not painterly card art: head-to-body ratio about
  1.25:1 to 1.5:1, rounded body mass, 4–6 px warm dark-brown outline at the
  512 px master scale, restrained cel shading, and a single soft lower-right
  contact value. No photoreal fur or dense texture noise.
- Each unit has a deliberate silhouette visible at approximately 100–140
  logical pixels high in the 1080 × 1920 combat viewport. Weapon and role
  are readable before colour is considered.
- Guardian: broad stance and shield/heavy guard prop. Fighter: diagonal
  melee weapon and forward lean. Ranger: bow, crossbow, sling, or rifle-like
  fantasy prop. Mage: staff, book, orb, or unmistakable spell focus. Support:
  potion, banner, charm, totem, or healing focus.
- Species is a supporting cue through anatomy, fur/feathers, costume and
  accent colours; it cannot make role silhouettes ambiguous. Character names,
  trait icon, class icon, and status markers remain separate accessible cues.
- Faction palette is intentionally secondary: Catfolk moonstone/gold,
  Dogfolk blue enamel/travel leather, Rabbitfolk spring green/linen,
  Highland cattle russet/brass, Exotic companions jewel tones/starlight.

## Exact hero roster mapping

This table is the required identity matrix. Each final sprite, portrait crop,
skill icon, and cast VFX must remain traceable to the same hero ID.

| Heroes | Species | Class coverage |
| --- | --- | --- |
| H01–H05 | Catfolk | Guardian, Fighter, Ranger, Mage, Support |
| H06–H10 | Dogfolk | Guardian, Fighter, Ranger, Mage, Support |
| H11–H14 | Rabbitfolk | Fighter, Ranger, Mage, Support |
| H15–H17 | Highland cattle | Guardian, Fighter, Support |
| H18–H20 | Exotic companions | Ranger, Mage, Guardian |

All twenty are playable shop heroes. No H21–H24 hero is generated,
registered, shown in Collection, or used as a placeholder.

## Asset set and mobile budget

1. Twenty hero master cutouts at 512 × 512, packed into appropriate runtime
   pages. Each has a portrait crop, ability icon, cast VFX key, and rig pose
   data for idle/spawn/move/basic/cast/hit/death. `rig_transform_static_pose`
   is valid only when runtime motion is visibly supplied by `HeroRig2D`; it
   must never be labelled as a six-frame animation.
2. Sixteen monster cutouts: a normal, elite, and boss-family visual for each
   of Meadow, Ruins, Frost Keep, and Ember Citadel. They are original chibi
   fantasy enemies and are presented by a reusable runtime `MonsterView`.
3. Ten independent combat effects: basic hit, physical impact, magic impact,
   cast flash, projectile, heal, shield, stun, slow, critical, and death.
   Effects can share a carefully documented atlas page but each declared key
   maps to only its own crop.
4. Icon-only HUD kit for gold, health, XP/level, reroll, lock, pause, speed,
   trait rarity, and item rarity. Labels and button surfaces are authored by
   Godot and retain 44 × 44 logical-pixel touch targets and 8 px separation.
5. Biome boards remain independent of all character cutouts. The existing
   board geometry is under separate design review; this visual pipeline must
   not choose or encode either a 3 × 8 or a 6 × 4 board.

Runtime texture import must use the project's mobile ETC2/ASTC-compatible
path. Atlas dimensions and import settings are checked on device rather than
assuming desktop memory behaviour.

## Runtime composition

`AssetManifest` is the sole asset-key authority. `UnitView` / `HeroRig2D`
resolve the hero atlas texture at runtime; `MonsterView` resolves its monster
texture at runtime; battle UI resolves icon and effect textures at runtime.
The manifest cannot be used as a decorative inventory: every declared
gameplay art key has a live consumer, every consumer has a loadable manifest
entry, and a missing entry produces a test failure rather than a silent
fallback card.

The client overlays engine-owned shadow, selection ring, HP/mana, nameplate,
rarity, target marker and VFX around the cutout. This protects legibility
when combat speed, health, or status changes.

## Acceptance gates

Visual work cannot be marked complete unless all of the following are true:

1. Manual inspection confirms H01–H20 and all monster assets have no baked
   card frame/background; no rejected card atlas is a runtime consumer.
2. Automated manifest test resolves every asset file and crop; runtime tests
   prove hero, monster, HUD, and VFX consumers receive non-null textures.
3. A real 1080 × 1920 in-game capture shows separate board, unit, monster,
   HUD and VFX layers. The capture is inspected at native scale, not inferred
   from an atlas.
4. The capture remains readable at normal mobile size: class silhouette,
   player/enemy state, HP/mana, and a combat event can be identified without
   relying solely on colour.
5. All twenty IDs and the exact species/class mapping above validate against
   `content/alpha-0.3.0/bundle.json`; no deferred Unique hero is introduced.
6. Godot visual tests, game-core content tests, Android build, and an
   Android performance pass succeed after the new art is integrated.

## Explicit rejections

- Do not crop character art from a bordered concept sheet.
- Do not use a full-frame image as an alleged transparent sprite.
- Do not substitute a blank atlas cell or a generic card for any H01–H20.
- Do not claim animated sprite-sheet coverage from repeated static frames.
- Do not use TFT assets, names, characters, layouts, or other protected art.
