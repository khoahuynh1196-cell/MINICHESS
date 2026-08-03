# Data-driven trigger runtime design

**Status:** User-delegated design approval ("tự thiết kế") — 2026-08-03  
**Scope:** Server-authoritative item, Unique, and future trait triggers for Alpha v0.3.

## Goal

Execute every content-defined combat trigger deterministically without branching on
hero, item, Unique, or trait IDs. The Godot client only renders the resulting
events.

## Canonical content model

The compiler accepts the current bundle spelling and produces this canonical form:

- `combat_start` → `on_combat_start`
- `basic_attack` → `on_basic_attack`
- `skill_cast` → `on_cast_resolve`
- `first_skill_cast` → `on_cast_resolve` plus `once_per_combat: true`
- `hp_below_percent` → `on_hp_below` with `threshold_percent`
- `every_third_basic_attack` → `on_every_nth_basic_attack` with `attack_count: 3`
- `basic_attack_damage` lifesteal rule → `on_damage_dealt`, `basic_only: true`,
  action `lifesteal`.

New content must use the `on_*` spelling. The compiler rejects unknown names,
malformed thresholds, non-positive counters/cooldowns, missing effects, duplicate
trigger IDs per owner, and `on_hp_below` without `once_per_combat`.

`scales_with_max_hp: true` means `floor(holder.max_hp * base_value / 1000)`;
thus `120`, `150`, and `250` mean 12%, 15%, and 25% respectively. Lifesteal
uses post-mitigation damage and `floor(damage * value / 1000)`.

## Snapshot and kernel boundary

`buildCombatSnapshot` converts equipped item definitions and active trait effects
into immutable `CombatPassive` records attached to the holder unit. A passive has
stable `owner_id`, `trigger_id`, canonical trigger condition, optional cooldown,
and actions/effects. The lock snapshot already freezes item holders and trait
counts, so replays receive the exact same passive list.

The kernel canonicalizes passive order by `(holder_unit_id, owner_id, trigger_id)`.
It maintains per-passive state only in runtime memory: fired-once flag, next
eligible tick, and basic-attack counter. State never leaves the combat result;
the event log is the replay artefact.

## Dispatch order

1. Spawn all units, then dispatch `on_combat_start` in canonical passive order.
2. A basic attack emits `BASIC_ATTACK`, resolves normal damage, then dispatches
   `on_basic_attack`, `on_every_nth_basic_attack`, and qualifying
   `on_damage_dealt` effects.
3. A cast emits `CAST_RESOLVED`, resolves its skill effects, then dispatches
   `on_cast_resolve`.
4. Every damage application evaluates the damaged unit's `on_hp_below` passives
   after HP/shields/mana/death processing. A dead holder cannot dispatch.
5. Each triggered action uses the existing effect executor and target selector;
   spawned U05 decoys use the global summon cap and expiry rules.

For a single dispatch point, passives are stable-sorted. Effects within one
trigger retain JSON order. Follow-on damage and triggers resolve immediately
before the next passive, giving a deterministic, finite event sequence. A
passive may not recursively dispatch the same trigger in its own action chain.

## Alpha mappings

| Definition | Canonical behavior |
| --- | --- |
| I09 | Basic-attack post-mitigation lifesteal 15%. |
| I10 | Combat-start self shield. |
| I11 | Magic damage to cast target after holder cast resolves. |
| I12 | Slow cast target after holder basic attack, 60-tick cooldown. |
| U01 | First HP ≤50%: stun adjacent enemies for 20 ticks. |
| U02 | Every third basic attack: 35% physical bonus damage. |
| U03 | Combat-start shield equal to 12% holder max HP. |
| U04 | First resolved cast: heal lowest-HP ally for 12% holder max HP. |
| U05 | First resolved cast: summon 25%-HP, zero-damage decoy for 80 ticks. |
| U06 | First HP ≤30%: cleanse then shield for 15% holder max HP. |

## Safety and tests

- No client-provided passive, effect, seed, holder, or trigger state is accepted.
- The compiler accepts legacy spellings only through a one-way normalization and
  exposes canonical output to the server.
- Tests cover each Alpha item/Unique, cooldown/once/counter boundaries, max-HP
  scaling, summon cap, fixed ordering, replay hashes, invalid schemas, and the
  1,000-combat deterministic stress gate.
- UI tests only consume emitted events; transformation rendering reads the locked
  equipped Unique definition and never changes traits or hitboxes.

