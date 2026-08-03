# Moonfall Tactics: 20-Hero Asset Pack

## Scope

This pack upgrades the existing static character art into a rig-ready 2D
presentation system. `game-core` and server combat stay unchanged. The Godot
presentation package supplies a common six-state animation vocabulary, weapon
attachments, VFX cues, and SFX cues for every hero.

The current `HeroRig2D` is intentionally standalone. It displays the existing
full-body source sprite as a preview while a production artist supplies the
eight cutout layers in `client-godot/assets/hero-kits/`. Once a layer is ready,
call `set_layer_texture(layer_id, texture, anchor)`; no replay or content
change is required.

## Animation Timing

| State | Time | Required read |
| --- | ---: | --- |
| idle | loop | 4 px breathing bob, subtle weapon settle |
| move | 0.28 s | two-step body sway and forward lean |
| basic_attack | 0.34 s | anticipation, contact at 0.18 s, 0.16 s recovery |
| hit | 0.18 s | recoil and red flash |
| skill_cast | 0.52 s | charge, release at 0.30 s, settle |
| death | 0.65 s | silhouette fall, desaturate, no gameplay delay |

## Per-Hero Kit Matrix

| Hero | Read and silhouette | Weapon rig and basic | Skill VFX and sound |
| --- | --- | --- | --- |
| H01 Cotton Bulwark | round cotton cat, broad stance | shield raised on `Weapon`, guard shove | mint barrier ring, low guard thump |
| H02 Ember Duelist | compact cat, forward lean | sword wrist slash, ember follow-through | orange dash slash, hot blade sweep |
| H03 Forest Ranger | light cat, tail counterweight | bow draw and release | leaf arrow trail, bow twang |
| H04 Frost Mage | tall hood and staff silhouette | staff point, back cloak sway | blue frost wave, icy rise |
| H05 Lantern Healer | gentle cat, lantern chain | lantern pendulum swing | gold healing bloom, glass chime |
| H06 Moonshield | dog guard with moon crest | shield brace and bump | lavender moon barrier, deep guard thump |
| H07 Scarf Brawler | dog with reactive scarf tail | two-punch combo, scarf lag | thorn impact burst, leather punch |
| H08 Hooded Ranger | dog, low hooded posture | crossbow aim and release | green focus mark, bolt snap |
| H09 Star Mage | dog, wand and star cap | wand orbit and point | violet star arc, sparkling magic tone |
| H10 Medic Dog | dog with bag and bottle | satchel toss | pale moon ward, medicine chime |
| H11 Dashing Rabbit | rabbit ears compress before launch | spear thrust, feet trail | earth burrow dash, charge rise |
| H12 Hooded Rabbit Ranger | rabbit ears under hood | bow draw, two-arrow recoil | thistle volley, quick bow twang |
| H13 Potion Rabbit | rabbit, flask held high | flask throw, arm follow-through | ember spore cloud, bubbling magic tone |
| H14 Rabbit Healer | rabbit, flower wand | wand circle, soft ear lag | pink remedy bloom, bright chime |
| H15 Bulwark Cow | heavy cow, grounded feet | tower shield absorb pose | earth decoy ring, low stone thump |
| H16 Hammer Cow | cow, oversized hammer silhouette | full-body hammer smash | horn shock burst, hammer impact |
| H17 Lantern Cow | cow, broad lantern support pose | lantern lift and settle | purifying bloom, warm chime |
| H18 Red Panda Ranger | agile red panda, tail balance | chakram throw and catch | ricochet streak, sharp release |
| H19 Owl Mage | owl wings frame tome | tome open and hover | prismatic burst, layered magic tone |
| H20 Capybara Guardian | capybara, shell back silhouette | shell-forward brace | shell bastion ring, resilient guard thump |

## Required Source Deliverables

For each hero deliver the following before the rig is considered final:

1. Eight PNG cutout layers: `body`, `head`, `arm_back`, `arm_front`,
   `leg_back`, `leg_front`, `weapon`, and `fx_mask`.
2. A Godot `Skeleton2D` scene using the common bone contract and all six
   animation tracks. Add secondary bones for ears, tails, cloth, chains, and
   other soft elements listed in the matrix.
3. Four mono OGG sounds: attack, skill, hit, and death. The current runtime
   synthesizes temporary cues so the presentation remains audible before the
   recorded files arrive.
4. One 256 x 256 transparent ability icon and one 512 x 512 portrait crop.
5. A 1024 x 1024 runtime atlas only after the source package passes pivot and
   layering review.

## Integration Later

When the current battle-controller work is ready, `UnitView` owns a
`HeroRig2D`, passes its current full-body texture as the preview body, and
forwards the existing presentation events to the rig. `HeroRig2D` owns visual
state only; HP, positions, event ordering, and victory logic remain in the
authoritative replay.
