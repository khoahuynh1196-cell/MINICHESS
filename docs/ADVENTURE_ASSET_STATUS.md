# Adventure Asset Production Status
**Version 1.6.0** · Client presentation milestone · 2026-08-11 · `codex/adventure-4x8-today`

---

## AI READING INSTRUCTION

Read `[SPEC]` and `[BUG]` blocks for authoritative implementation facts.
Read `[NOTE]` for context. `[?]` marks work that is intentionally not yet production-complete.

---

## 1. Monster cutout inventory

**[SPEC]**

- `client-godot/assets/asset_manifest.json` registers exactly 16 Adventure monster variants.
- All 16 variants use `source_mode=generated_cutout`; no monster record is pending or marker-only.
- Each monster record resolves a standalone RGBA PNG at 1254 × 1254 through `AssetManifest.resolve_monster_texture`.
- Newly generated boss/boss-family cutouts:

| Variant | Runtime asset |
| --- | --- |
| `meadow_boss_family` / Meadow Warden | `assets/monsters/meadow-briar-warden-family-v1.png` |
| `ruins_boss_family` / Crypt Warden | `assets/monsters/ruins-crypt-warden-family-v1.png` |
| `frost_keep_boss` / Glacier Tyrant | `assets/monsters/frost-glacier-tyrant-v1.png` |
| `frost_keep_boss_family` / Icebound Warden | `assets/monsters/frost-icebound-warden-family-v1.png` |
| `ember_citadel_boss` / Cinder Lord | `assets/monsters/ember-cinder-lord-v1.png` |
| `ember_citadel_boss_family` / Furnace Warden | `assets/monsters/ember-furnace-warden-family-v1.png` |

**[NOTE]**

The six files were generated as centered full-body chroma-key art and converted to alpha PNGs with the repository imagegen removal helper. The manifest test now locks every monster variant to `generated_cutout`, so a future pending fallback fails CI.

## 2. VFX coverage

**[SPEC]**

- H01-H16 now resolve authored hero skill VFX alpha sprites; H17-H20 remain truthfully marked `render_mode=procedural`.
- Four combat routes now have authored alpha layers: `combat_vfx/damage`, `combat_vfx/heal`, `combat_vfx/shield`, and `combat_vfx/cc`.
- `CombatVfxPool` resolves those route layers through the manifest and passes them into the pooled effect; a missing layer still falls back to the procedural draw path.
- `CombatVfx2D` supplies the live runtime cues (damage flash, hit spark, shield/barrier, heal bloom, crowd-control, elemental waves, dash and related telegraphs).
- `CombatVfxPool` recycles effect layers between combat events; it does not allocate one permanent layer per event.
- Transformation VFX keys resolve from `assets/vfx/vfx-atlas-v1.png` where an authored manifest layer is declared.

**[?]**

Per-hero authored skill VFX are in a validated pilot state: H01 shield, H02 ember slash, H03 forest volley, H04 frost burst, H05 heal bloom, H06 moon barrier, H07 impact burst, H08 shadow arrow, H09 starburst, H10 heal pulse, H11 dash burst, H12 bramble volley, H13 searing spores, H14 meadow remedy, H15 earth decoy, and H16 hornbreaker are authored alpha sprites. H17-H20 still use the production-safe procedural readability fallback, so the final 20-skill authored VFX pack is not complete.

## 3. Audio coverage

**[SPEC]**

- No recorded `.ogg`, `.wav`, `.mp3`, or `.flac` files are currently shipped under `client-godot/assets`.
- `AudioFeedback` validates the approved cue IDs and haptic requests.
- `HeroSfxBus` synthesizes short 16-bit, 22.05 kHz PCM cues at runtime for the current demo build.

**[?]**

The final audio pack (recorded or designed one-shot cues, mix variants, and device loudness QA) is not complete. Replace the synthesized fallback behind the existing cue IDs without changing combat event contracts.

## 4. Combat animation state contract

**[SPEC]**

- `UnitView.present()` and `HeroRig2D.play_action()` enforce one shared presentation priority: `death > control > hit > skill/cast > basic_attack > move > idle`.
- A lower-priority event cannot overwrite an active action; `idle` is reserved for action completion and `death` remains terminal.
- `STUN_APPLIED` and `SLOW_APPLIED` now use the explicit `control` state while preserving the authoritative status text (`stunned`/`slowed`).
- The rig reuses the hit pose, VFX and SFX fallback for `control` until a dedicated crowd-control animation layer is authored.

**[?]**

This state gate is the Gate 2 preparation slice, not the complete combat presentation gate. Timeline-authored release/impact frames, per-hero skill layers, recorded audio and device performance evidence remain open.

## 5. Completion gates

**[SPEC]**

1. Keep the manifest and `asset_manifest_test.gd` green for all 16 monster variants.
2. Add one authored VFX layer/scene per remaining hero skill key, then switch only that key from `procedural` after visual QA.
3. Add recorded audio files behind the existing `AudioFeedback.CUE_IDS`, with a device loudness and latency pass before release.
4. Re-run the Godot headless suite and capture a 1080 × 1920 Adventure combat frame showing independent board, monster, HUD, VFX, and audio-triggered feedback layers.

## 6. Verification

**[SPEC]**

- Focused command: `Godot --headless --path client-godot --script res://test/asset_manifest_test.gd --quit`
- Animation priority regression: `Godot --headless --path client-godot --script res://test/animation_priority_test.gd --quit`
- Hero VFX manifest regression: `Godot --headless --path client-godot --script res://test/hero_vfx_manifest_test.gd --quit`
- The focused asset and hero VFX manifest tests pass after importing the generated PNGs.
- The same test fails when any monster source mode contains a pending fallback marker.

## Changelog

- 1.6.0 — Added the validated H13-H16 authored hero skill VFX batch; H17-H20 remain procedural until their own assets pass QA.
- 1.5.0 — Added the validated H09-H12 authored hero skill VFX batch; H13-H20 remain procedural until their own assets pass QA.
- 1.4.0 — Added the validated H05-H08 authored hero skill VFX batch; H09-H20 remain procedural until their own assets pass QA.
- 1.3.0 — Added the validated H01-H04 authored hero skill VFX pilot pack; H05-H20 remain procedural until their own assets pass QA.
- 1.2.0 — Added the authoritative combat animation priority gate and explicit hard-control presentation state.

- 1.1.0 — Added authored damage/heal/shield/CC route layers while retaining the procedural hero-skill fallback.
- 1.0.0 — Added the six missing Adventure boss cutouts and recorded the remaining authored VFX/audio gates.
