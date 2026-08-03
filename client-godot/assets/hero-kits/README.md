# Hero Kit Source Contract

This folder is the stable handoff location for production art. The current game
can preview every kit with its existing full-body sprite, a procedural weapon,
VFX, and synthesized SFX. Replacing that preview never changes simulation or
the replay event schema.

Each hero gets this layout:

```text
assets/hero-kits/h01/
  source/body.png
  source/head.png
  source/arm_back.png
  source/arm_front.png
  source/leg_back.png
  source/leg_front.png
  source/weapon.png
  source/fx_mask.png
  export/hero-rig.tscn
  export/ability-icon.png
  audio/attack.ogg
  audio/skill.ogg
  audio/hit.ogg
  audio/death.ogg
```

## Art Rules

- Deliver 2048 x 2048 RGBA PNG source layers, transparent background, no baked
  cast shadow, and a shared ground line at y=1536.
- Export a 1024 x 1024 atlas only after cutouts, rig weights, and pivots are
  approved. Keep the source layers editable.
- The visible weapon is a separate layer and must be centered on its grip.
- Keep the front arm, weapon, and FX mask above the body; keep the back arm and
  back leg below the body.
- Do not bake skill particles, glow, damage numbers, or hit flashes into body
  art. The VFX runtime owns those cues.

## Bone Contract

```text
Skeleton
  Body
    Head
    Chest
    Back
    Weapon
    Feet
```

All 20 heroes use these anchors. The production rig adds weighted part bones
below them only where the silhouette needs extra bend: ear, tail, scarf, cloak,
lantern chain, or shield strap. This keeps attachment, VFX, and item anchors
stable across every hero.

## Replay Contract

`HeroRig2D.trigger_from_combat_event()` maps existing authoritative replay
events to `move`, `basic_attack`, `skill_cast`, `hit`, and `death`. It never
calculates combat state. Attach it to `UnitView` when the controller changes
are ready.
