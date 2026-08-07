import { compileCombatEffect } from "../content/compiler.js";
import type { CombatTriggerKind, CompiledCombatTrigger, CompiledContentBundle, RawHero, RawSkill } from "../content/types.js";
import type { CombatEffect, CombatStat, DamageType, EffectTarget } from "../effects/definitions.js";
import type { CompiledRuleset } from "../rules/types.js";
import { sha256Hex } from "../serialization/canonical-json.js";
import type { AdventureCombatEngineRequest, AdventureCombatEngineResult } from "../adventure/engine.js";
import type { AdventureCombatOutcome } from "../adventure/lifecycle.js";
import { createAdventureCombatPlayback, type AdventureCombatPlayback, type AdventurePlaybackEvent, type AdventurePlaybackEventType } from "../adventure/playback.js";
import type { AdventureCombatEnemyRef, AdventureCombatHeroRef, AdventureCombatSnapshot } from "../adventure/snapshot.js";
import { type CombatGeometry, displace, geometryFromRules, horizontalDirection, manhattanDistance, orthogonalNeighbors, verticalDirection } from "./geometry.js";
import { createSeededRng, type SeededRng } from "./seeded-rng.js";

/**
 * Production 4x8 deterministic combat kernel.
 *
 * Numeric convention: every stat, damage, heal, shield, and mana value in
 * authored content is a fixed-point integer scaled by `SCALE` (1000), the
 * same convention `effects/definitions.ts` and the legacy kernel already
 * use (e.g. `attack_speed: 1000` means a 1.0x rate, `crit_multiplier: 1500`
 * means 1.5x). This kernel keeps all internal math in that same scaled
 * space and never converts to a "display" number.
 *
 * `CombatEffect.baseValue` interpretation (not specified by a design doc;
 * inferred from `content/alpha-0.3.0/bundle.json` and documented here for
 * Mission 9 balance review):
 *   - deal_damage / heal / shield / restore_mana / apply_dot without any
 *     `scalesWith*` flag: an absolute amount in the SCALE=1000 space.
 *   - deal_damage / heal / shield with a `scalesWith*` flag: baseValue/SCALE
 *     is a coefficient multiplied by the referenced stat (e.g.
 *     `scalesWithAttackDamage: true, baseValue: 500` = 50% of the source's
 *     attack damage).
 *   - buff_stat / debuff_stat / slow / damage_reduction (all percent-like):
 *     baseValue/SCALE is the fractional change, applied multiplicatively
 *     for "percent" mode stat changes, or as a plain fraction for
 *     slow/damage_reduction.
 *   - buff_stat / debuff_stat with mode "flat": baseValue is added directly
 *     to the stat's own SCALE=1000 value (stats and baseValue share one
 *     fixed-point space).
 */

export const SCALE = 1_000;
const BASIC_ATTACK_MIN_INTERVAL_TICKS = 5;
const MANA_PER_BASIC_ATTACK = 10 * SCALE;
const MANA_PER_INSTANCE_OF_DAMAGE_TAKEN = 10 * SCALE;

const STAT_KEYS: readonly CombatStat[] = [
  "max_hp", "attack_damage", "attack_speed", "armor", "magic_resist", "move_speed",
  "starting_mana", "max_mana", "crit_chance", "crit_multiplier", "skill_power",
];

interface StatModifierInstance {
  readonly id: string;
  readonly stat: CombatStat;
  readonly mode: "flat" | "percent";
  readonly amount: number;
  readonly endTick: number;
  readonly removeOnMove: boolean;
}

interface StatusEffectInstance {
  readonly id: string;
  readonly kind: "stun" | "slow" | "damage_reduction";
  readonly endTick: number;
  readonly amount: number;
  readonly maxStacks: number;
}

interface ShieldInstance {
  readonly id: string;
  amount: number;
  readonly endTick: number;
}

interface DotInstance {
  readonly id: string;
  readonly perTick: number;
  readonly damageType: DamageType;
  readonly intervalTicks: number;
  readonly endTick: number;
  readonly sourceId: string;
  nextTickAt: number;
}

interface TriggerRuntimeState {
  used: boolean;
  cooldownReadyTick: number;
  attackCounter: number;
}

interface OwnedTrigger {
  readonly ownerId: string;
  readonly trigger: CompiledCombatTrigger;
}

interface ActiveUnit {
  readonly id: string;
  readonly side: "player" | "enemy";
  readonly heroId: string;
  readonly hero: RawHero | undefined;
  readonly skillId: string | undefined;
  readonly skillEffects: readonly CombatEffect[];
  readonly castTimeTicks: number;
  readonly baseStats: Readonly<Record<CombatStat, number>>;
  position: number;
  hp: number;
  maxHp: number;
  mana: number;
  startingMana: number;
  isDead: boolean;
  isSummon: boolean;
  summonExpiryTick?: number;
  nextActionTick: number;
  moved: boolean;
  stationaryTicks: number;
  basicAttackCount: number;
  lockedTargetId?: string;
  modifiers: StatModifierInstance[];
  statusEffects: StatusEffectInstance[];
  shields: ShieldInstance[];
  dots: DotInstance[];
  triggerState: Map<string, TriggerRuntimeState>;
}

function statValue(unit: ActiveUnit, stat: CombatStat): number {
  let flatSum = 0;
  let percentSum = 0;
  for (const modifier of unit.modifiers) {
    if (modifier.stat !== stat) continue;
    if (modifier.mode === "flat") flatSum += modifier.amount;
    else percentSum += modifier.amount;
  }
  let value = unit.baseStats[stat] + flatSum;
  value = Math.round(value * (SCALE + percentSum) / SCALE);
  if (stat === "move_speed" || stat === "attack_speed") {
    for (const status of unit.statusEffects) {
      if (status.kind === "slow") value = Math.round(value * (SCALE - status.amount) / SCALE);
    }
  }
  return Math.max(0, value);
}

function damageReductionFraction(unit: ActiveUnit): number {
  let total = 0;
  for (const status of unit.statusEffects) if (status.kind === "damage_reduction") total += status.amount;
  return Math.min(SCALE, total);
}

function isStunned(unit: ActiveUnit): boolean {
  return unit.statusEffects.some((status) => status.kind === "stun");
}

function heroBaseStats(hero: RawHero | undefined, statMultiplier: number, starKey: "one" | "two" | "three"): Record<CombatStat, number> {
  const result: Partial<Record<CombatStat, number>> = {};
  for (const stat of STAT_KEYS) {
    const base = hero?.base_stats[stat] ?? 0;
    const scaleKey = starKey === "one" ? undefined : starKey;
    const starMultiplier = scaleKey !== undefined ? hero?.star_multipliers?.[scaleKey]?.[stat] : undefined;
    const effectiveMultiplier = starMultiplier ?? statMultiplier;
    result[stat] = Math.round((base * effectiveMultiplier) / SCALE);
  }
  return result as Record<CombatStat, number>;
}

function starKeyFor(stars: 1 | 2 | 3): "one" | "two" | "three" {
  return stars === 3 ? "three" : stars === 2 ? "two" : "one";
}

// Armor/magic resist use the standard diminishing-returns mitigation curve
// (mitigation = resist / (100 + resist), in real, unscaled terms — e.g. 20
// armor mitigates 20/120 = ~16.7%). Content stores armor/magic_resist in the
// same SCALE=1000 fixed-point space as every other stat (20 real armor is
// authored as 20000), so the "100" constant is scaled to 100*SCALE to stay
// in that same space rather than converting to a real number first.
const MITIGATION_CONSTANT = 100 * SCALE;

function resolveMitigatedDamage(rawDamage: number, damageType: DamageType, armor: number, magicResist: number): number {
  if (damageType === "true") return Math.max(0, Math.round(rawDamage));
  const resist = damageType === "physical" ? armor : magicResist;
  const mitigated = resist >= 0
    ? (rawDamage * MITIGATION_CONSTANT) / (MITIGATION_CONSTANT + resist)
    : (rawDamage * (MITIGATION_CONSTANT + Math.abs(resist))) / MITIGATION_CONSTANT;
  return Math.max(0, Math.round(mitigated));
}

function magnitudeOf(effect: CombatEffect, source: ActiveUnit, target: ActiveUnit): number {
  const baseValue = effect.baseValue ?? 0;
  if (effect.scalesWithAttackDamage) return Math.round((statValue(source, "attack_damage") * baseValue) / SCALE);
  if (effect.scalesWithSkillPower) return Math.round((statValue(source, "skill_power") * baseValue) / SCALE);
  if (effect.scalesWithMaxHp) return Math.round((statValue(source, "max_hp") * baseValue) / SCALE);
  if (effect.scalesWithTargetMaxHp) return Math.round((statValue(target, "max_hp") * baseValue) / SCALE);
  return baseValue;
}

export function runProductionCombat(request: AdventureCombatEngineRequest): AdventureCombatEngineResult {
  const { snapshot, rules, content } = request;
  const geometry = geometryFromRules(snapshot);
  const rng = createSeededRng(snapshot.combatSeed);
  const maxTicks = snapshot.maxTicks;
  const tickRate = snapshot.tickRate;
  const events: AdventurePlaybackEvent[] = [];
  let sequence = 0;

  function pushEvent(
    tick: number,
    type: AdventurePlaybackEventType,
    payload: Record<string, string | number | boolean>,
    details?: Partial<AdventurePlaybackEvent>,
  ): void {
    const releaseTick = details?.releaseTick !== undefined ? Math.max(0, Math.min(details.releaseTick, maxTicks)) : undefined;
    const impactTick = details?.impactTick !== undefined ? Math.max(releaseTick ?? 0, Math.min(details.impactTick, maxTicks)) : undefined;
    events.push(Object.freeze({
      sequence: sequence++,
      tick: Math.max(0, Math.min(tick, maxTicks)),
      type,
      payload: Object.freeze(payload),
      ...details,
      ...(releaseTick === undefined ? {} : { releaseTick }),
      ...(impactTick === undefined ? {} : { impactTick }),
    }));
  }

  const units: ActiveUnit[] = [];
  const unitsById = new Map<string, ActiveUnit>();

  function skillFor(hero: RawHero | undefined): { skillId: string | undefined; effects: readonly CombatEffect[]; castTimeTicks: number } {
    if (hero === undefined) return { skillId: undefined, effects: [], castTimeTicks: 20 };
    const skill: RawSkill | undefined = content.skillsById.get(hero.skill_id);
    if (skill === undefined) return { skillId: undefined, effects: [], castTimeTicks: 20 };
    return {
      skillId: skill.id,
      effects: Object.freeze(skill.effects.map((effect) => compileCombatEffect(effect))),
      castTimeTicks: skill.cast_time_ticks,
    };
  }

  function spawnUnit(input: {
    readonly id: string;
    readonly side: "player" | "enemy";
    readonly heroId: string;
    readonly position: number;
    readonly starKeyOrMultiplier: { readonly stars: 1 | 2 | 3 } | { readonly statMultiplier: number };
  }): ActiveUnit {
    const hero = content.heroesById.get(input.heroId);
    const baseStats = "stars" in input.starKeyOrMultiplier
      ? heroBaseStats(hero, SCALE, starKeyFor(input.starKeyOrMultiplier.stars))
      : heroBaseStats(hero, input.starKeyOrMultiplier.statMultiplier, "one");
    const skill = skillFor(hero);
    const unit: ActiveUnit = {
      id: input.id,
      side: input.side,
      heroId: input.heroId,
      hero,
      skillId: skill.skillId,
      skillEffects: skill.effects,
      castTimeTicks: skill.castTimeTicks,
      baseStats,
      position: input.position,
      hp: baseStats.max_hp,
      maxHp: baseStats.max_hp,
      mana: Math.min(baseStats.starting_mana, baseStats.max_mana),
      startingMana: baseStats.starting_mana,
      isDead: false,
      isSummon: false,
      nextActionTick: 0,
      moved: false,
      stationaryTicks: 0,
      basicAttackCount: 0,
      modifiers: [],
      statusEffects: [],
      shields: [],
      dots: [],
      triggerState: new Map(),
    };
    units.push(unit);
    unitsById.set(unit.id, unit);
    pushEvent(0, "UNIT_SPAWNED", { unitId: unit.id, side: unit.side, position: unit.position, hp: unit.hp });
    return unit;
  }

  pushEvent(0, "COMBAT_STARTED", { round: snapshot.round, combatId: snapshot.combatId });

  for (const playerUnit of snapshot.playerUnits as readonly AdventureCombatHeroRef[]) {
    spawnUnit({ id: playerUnit.unitId, side: "player", heroId: playerUnit.heroId, position: playerUnit.globalPosition, starKeyOrMultiplier: { stars: playerUnit.stars } });
  }
  for (const enemyUnit of snapshot.enemyUnits as readonly AdventureCombatEnemyRef[]) {
    spawnUnit({ id: enemyUnit.unitId, side: "enemy", heroId: enemyUnit.heroId, position: enemyUnit.globalPosition, starKeyOrMultiplier: { statMultiplier: enemyUnit.statMultiplier } });
  }

  function activeUnitsOfSide(side: "player" | "enemy"): ActiveUnit[] {
    return units.filter((unit) => unit.side === side && !unit.isDead);
  }

  function otherSide(side: "player" | "enemy"): "player" | "enemy" {
    return side === "player" ? "enemy" : "player";
  }

  function nearestEnemyTo(unit: ActiveUnit): ActiveUnit | undefined {
    const enemies = activeUnitsOfSide(otherSide(unit.side));
    if (enemies.length === 0) return undefined;
    return [...enemies].sort((left, right) => {
      const distance = manhattanDistance(geometry, unit.position, left.position) - manhattanDistance(geometry, unit.position, right.position);
      return distance !== 0 ? distance : left.id.localeCompare(right.id);
    })[0];
  }

  // ---- Ownership of traits/item triggers: only player-side units carry
  // roster-composition triggers (traits) or equipped-item triggers, matching
  // the snapshot contract (enemies have no itemIds/team-trait concept).
  const playerTraitTriggers = computePlayerTraitTriggers();
  const playerItemTriggers = computePlayerItemTriggers();

  function computePlayerTraitTriggers(): readonly OwnedTrigger[] {
    const distinctHeroesByTrait = new Map<string, Set<string>>();
    for (const playerUnit of snapshot.playerUnits as readonly AdventureCombatHeroRef[]) {
      const hero = content.heroesById.get(playerUnit.heroId);
      if (hero === undefined) continue;
      for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
        const set = distinctHeroesByTrait.get(traitId) ?? new Set<string>();
        set.add(hero.id);
        distinctHeroesByTrait.set(traitId, set);
      }
    }
    const owned: OwnedTrigger[] = [];
    for (const [traitId, heroes] of distinctHeroesByTrait) {
      const trait = content.traitsById.get(traitId) as { readonly breakpoints?: readonly { readonly count: number; readonly triggers?: readonly CompiledCombatTrigger[] }[] } | undefined;
      const breakpoints = trait?.breakpoints ?? [];
      const active = [...breakpoints].filter((breakpoint) => breakpoint.count <= heroes.size).at(-1);
      if (active === undefined) continue;
      for (const trigger of active.triggers ?? []) {
        for (const playerUnit of snapshot.playerUnits as readonly AdventureCombatHeroRef[]) {
          if (trigger.holderHeroIds !== undefined && !trigger.holderHeroIds.includes(playerUnit.heroId)) continue;
          owned.push({ ownerId: playerUnit.unitId, trigger });
        }
      }
    }
    return Object.freeze(owned);
  }

  function computePlayerItemTriggers(): readonly OwnedTrigger[] {
    const owned: OwnedTrigger[] = [];
    for (const playerUnit of snapshot.playerUnits as readonly AdventureCombatHeroRef[]) {
      for (const itemId of playerUnit.itemIds) {
        const item = content.normalItems.find((candidate) => candidate.id === itemId) ?? content.uniqueItems.find((candidate) => candidate.id === itemId);
        for (const trigger of item?.triggers ?? []) owned.push({ ownerId: playerUnit.unitId, trigger });
      }
    }
    return Object.freeze(owned);
  }

  function triggersFor(kind: CombatTriggerKind): readonly OwnedTrigger[] {
    return [...playerTraitTriggers, ...playerItemTriggers].filter((owned) => owned.trigger.trigger === kind);
  }

  function triggerRuntimeState(ownerId: string, triggerId: string): TriggerRuntimeState {
    const key = `${ownerId}:${triggerId}`;
    let state = unitsById.get(ownerId)?.triggerState.get(key);
    if (state === undefined) {
      state = { used: false, cooldownReadyTick: 0, attackCounter: 0 };
      unitsById.get(ownerId)?.triggerState.set(key, state);
    }
    return state;
  }

  function resolveTargets(source: ActiveUnit, target: EffectTarget): readonly ActiveUnit[] {
    const allies = units.filter((unit) => unit.side === source.side && !unit.isDead);
    const enemies = units.filter((unit) => unit.side !== source.side && !unit.isDead);
    switch (target) {
      case "self":
        return [source];
      case "locked_target": {
        const locked = source.lockedTargetId !== undefined ? unitsById.get(source.lockedTargetId) : undefined;
        if (locked !== undefined && !locked.isDead) return [locked];
        const nearest = nearestEnemyTo(source);
        return nearest !== undefined ? [nearest] : [];
      }
      case "nearest_other_enemy": {
        const nearest = nearestEnemyTo(source);
        return nearest !== undefined ? [nearest] : [];
      }
      case "lowest_hp_ally": {
        if (allies.length === 0) return [];
        return [[...allies].sort((left, right) => {
          const ratio = left.hp / left.maxHp - right.hp / right.maxHp;
          return ratio !== 0 ? ratio : left.id.localeCompare(right.id);
        })[0]!];
      }
      case "adjacent_allies":
        return allies.filter((ally) => ally.id !== source.id && manhattanDistance(geometry, source.position, ally.position) === 1);
      case "rear_ally": {
        const others = allies.filter((ally) => ally.id !== source.id);
        if (others.length === 0) return [];
        const direction = source.side === "player" ? -1 : 1;
        const behind = others.filter((ally) => Math.sign(rowOfDelta(source, ally)) === direction);
        const pool = behind.length > 0 ? behind : others;
        return [[...pool].sort((left, right) => {
          const distance = manhattanDistance(geometry, source.position, left.position) - manhattanDistance(geometry, source.position, right.position);
          return distance !== 0 ? distance : left.id.localeCompare(right.id);
        })[0]!];
      }
      case "nearest_trait_ally":
      case "adjacent_trait_allies":
      case "all_trait_allies": {
        const traitAllies = allies.filter((ally) => ally.id !== source.id && sharesTraitWith(source, ally));
        if (target === "all_trait_allies") return traitAllies;
        if (target === "adjacent_trait_allies") return traitAllies.filter((ally) => manhattanDistance(geometry, source.position, ally.position) === 1);
        if (traitAllies.length === 0) return [];
        return [[...traitAllies].sort((left, right) => {
          const distance = manhattanDistance(geometry, source.position, left.position) - manhattanDistance(geometry, source.position, right.position);
          return distance !== 0 ? distance : left.id.localeCompare(right.id);
        })[0]!];
      }
      case "adjacent_enemies":
        return enemies.filter((enemy) => manhattanDistance(geometry, source.position, enemy.position) === 1);
      case "all_enemies":
        return enemies;
    }
  }

  function rowOfDelta(source: ActiveUnit, other: ActiveUnit): number {
    return verticalDirection(geometry, source.position, other.position);
  }

  function sharesTraitWith(left: ActiveUnit, right: ActiveUnit): boolean {
    if (left.hero === undefined || right.hero === undefined) return false;
    return left.hero.species_trait_id === right.hero.species_trait_id || left.hero.class_trait_id === right.hero.class_trait_id;
  }

  function applyDamage(currentTick: number, source: ActiveUnit, target: ActiveUnit, amount: number, damageType: DamageType, actionId: string): void {
    const mitigated = resolveMitigatedDamage(amount, damageType, statValue(target, "armor"), statValue(target, "magic_resist"));
    const reduced = Math.max(0, Math.round(mitigated * (SCALE - damageReductionFraction(target)) / SCALE));
    let remaining = reduced;
    for (const shield of target.shields) {
      if (shield.amount <= 0) continue;
      if (shield.amount >= remaining) { shield.amount -= remaining; remaining = 0; break; }
      remaining -= shield.amount;
      shield.amount = 0;
    }
    target.hp = Math.max(0, target.hp - remaining);
    target.mana = Math.min(statValue(target, "max_mana"), target.mana + MANA_PER_INSTANCE_OF_DAMAGE_TAKEN);
    pushEvent(currentTick, "DAMAGE_APPLIED", { amount: reduced, remainingHp: target.hp }, {
      actionId, sourceUnitId: source.id, targetUnitId: target.id, targetPosition: target.position, impactTick: currentTick,
    });
    fireLifesteal(currentTick, source, reduced, actionId);
    fireTrigger("on_damage_dealt", currentTick, source, target, actionId);
    fireTrigger("on_heal_or_shield", currentTick, source, target, actionId, { skip: true });
    if (target.hp === 0 && !target.isDead) killUnit(currentTick, source, target, actionId);
  }

  function killUnit(currentTick: number, killer: ActiveUnit | undefined, target: ActiveUnit, actionId: string): void {
    target.isDead = true;
    pushEvent(currentTick, "UNIT_DIED", { unitId: target.id, ...(killer === undefined ? {} : { killerId: killer.id }) }, { targetUnitId: target.id, ...(killer === undefined ? {} : { sourceUnitId: killer.id }) });
    fireTrigger("on_death", currentTick, target, target, actionId);
    if (killer !== undefined) fireTrigger("on_kill", currentTick, killer, target, actionId);
  }

  function fireLifesteal(currentTick: number, source: ActiveUnit, damageDealt: number, actionId: string): void {
    for (const owned of triggersFor("on_damage_dealt")) {
      if (owned.ownerId !== source.id || owned.trigger.lifestealPerThousand === undefined) continue;
      const healAmount = Math.round((damageDealt * owned.trigger.lifestealPerThousand) / SCALE);
      if (healAmount <= 0) continue;
      applyHeal(currentTick, source, source, healAmount, actionId);
    }
  }

  function applyHeal(currentTick: number, source: ActiveUnit, target: ActiveUnit, amount: number, actionId: string): void {
    if (target.isDead || amount <= 0) return;
    const before = target.hp;
    target.hp = Math.min(target.maxHp, target.hp + amount);
    if (target.hp === before) return;
    pushEvent(currentTick, "HEAL_APPLIED", { amount: target.hp - before, remainingHp: target.hp }, {
      actionId, sourceUnitId: source.id, targetUnitId: target.id, targetPosition: target.position, impactTick: currentTick,
    });
    fireTrigger("on_heal_or_shield", currentTick, source, target, actionId);
  }

  function applyShield(currentTick: number, source: ActiveUnit, target: ActiveUnit, amount: number, durationTicks: number, actionId: string): void {
    if (target.isDead || amount <= 0) return;
    target.shields.push({ id: `${actionId}:${target.shields.length}`, amount, endTick: currentTick + durationTicks });
    pushEvent(currentTick, "SHIELD_APPLIED", { amount, remainingHp: target.hp }, {
      actionId, sourceUnitId: source.id, targetUnitId: target.id, targetPosition: target.position, impactTick: currentTick,
    });
    fireTrigger("on_heal_or_shield", currentTick, source, target, actionId);
  }

  function applyStatus(currentTick: number, target: ActiveUnit, kind: StatusEffectInstance["kind"], amount: number, durationTicks: number, maxStacks: number, actionId: string, source: ActiveUnit): void {
    if (target.isDead) return;
    const currentStacks = target.statusEffects.filter((status) => status.kind === kind).length;
    if (currentStacks >= maxStacks) {
      const oldest = target.statusEffects.filter((status) => status.kind === kind).sort((left, right) => left.endTick - right.endTick)[0];
      if (oldest !== undefined) target.statusEffects.splice(target.statusEffects.indexOf(oldest), 1);
    }
    target.statusEffects.push({ id: `${actionId}:${kind}:${target.statusEffects.length}`, kind, amount, endTick: currentTick + durationTicks, maxStacks });
    pushEvent(currentTick, "STATUS_APPLIED", { kind, amount, durationTicks }, {
      actionId, sourceUnitId: source.id, targetUnitId: target.id, targetPosition: target.position,
    });
  }

  function applyStatModifier(currentTick: number, target: ActiveUnit, stat: CombatStat, mode: "flat" | "percent", amount: number, durationTicks: number, maxStacks: number, removeOnMove: boolean, actionId: string, source: ActiveUnit): void {
    if (target.isDead) return;
    const matching = target.modifiers.filter((modifier) => modifier.stat === stat && modifier.mode === mode);
    if (matching.length >= maxStacks) {
      const oldest = matching.sort((left, right) => left.endTick - right.endTick)[0];
      if (oldest !== undefined) target.modifiers.splice(target.modifiers.indexOf(oldest), 1);
    }
    target.modifiers.push({ id: `${actionId}:${stat}:${target.modifiers.length}`, stat, mode, amount, endTick: currentTick + durationTicks, removeOnMove });
    pushEvent(currentTick, "STATUS_APPLIED", { kind: `${mode}_${stat}`, amount, durationTicks }, {
      actionId, sourceUnitId: source.id, targetUnitId: target.id, targetPosition: target.position,
    });
  }

  function applyDisplacement(currentTick: number, source: ActiveUnit, target: ActiveUnit, distance: number, kind: "dash" | "retreat" | "knockback", actionId: string): void {
    if (target.isDead) return;
    const reference = kind === "dash" ? nearestEnemyTo(target) : target === source ? nearestEnemyTo(source) : source;
    const towardTarget = kind === "dash";
    const horizontal = reference !== undefined ? horizontalDirection(geometry, target.position, reference.position) : 0;
    const vertical = reference !== undefined ? verticalDirection(geometry, target.position, reference.position) : 0;
    const sign = towardTarget ? 1 : -1;
    const occupied = (candidate: number) => units.some((unit) => !unit.isDead && unit.id !== target.id && unit.position === candidate);
    let destination = target.position;
    if (vertical !== 0) destination = displace(geometry, destination, (vertical * sign > 0) ? "down" : "up", distance);
    else if (horizontal !== 0) destination = displace(geometry, destination, (horizontal * sign > 0) ? "right" : "left", distance);
    if (occupied(destination)) return;
    const from = target.position;
    target.position = destination;
    pushEvent(currentTick, "MOVE_STARTED", { from, to: destination, kind }, { sourceUnitId: source.id, targetUnitId: target.id, sourcePosition: from, targetPosition: destination });
  }

  function applyCleanse(currentTick: number, target: ActiveUnit, actionId: string, source: ActiveUnit): void {
    const before = target.statusEffects.length;
    target.statusEffects = target.statusEffects.filter((status) => status.kind !== "stun" && status.kind !== "slow");
    if (target.statusEffects.length !== before) {
      pushEvent(currentTick, "STATUS_REMOVED", { kind: "cleanse" }, { actionId, sourceUnitId: source.id, targetUnitId: target.id });
    }
  }

  function applyDot(currentTick: number, source: ActiveUnit, target: ActiveUnit, effect: CombatEffect, actionId: string): void {
    if (target.isDead) return;
    const perTick = magnitudeOf(effect, source, target);
    const intervalTicks = effect.intervalTicks ?? 1;
    target.dots.push({
      id: `${actionId}:dot:${target.dots.length}`, perTick, damageType: effect.damageType ?? "magic", intervalTicks,
      endTick: currentTick + (effect.durationTicks ?? intervalTicks), sourceId: source.id, nextTickAt: currentTick + intervalTicks,
    });
  }

  function applyEffect(currentTick: number, source: ActiveUnit, effect: CombatEffect, actionId: string): void {
    const targets = resolveTargets(source, effect.target);
    for (const target of targets) {
      switch (effect.primitive) {
        case "deal_damage":
          applyDamage(currentTick, source, target, magnitudeOf(effect, source, target), effect.damageType ?? "true", actionId);
          break;
        case "heal":
          applyHeal(currentTick, source, target, magnitudeOf(effect, source, target), actionId);
          break;
        case "shield":
          applyShield(currentTick, source, target, magnitudeOf(effect, source, target), effect.durationTicks ?? 0, actionId);
          break;
        case "restore_mana":
          target.mana = Math.min(statValue(target, "max_mana"), target.mana + (effect.baseValue ?? 0));
          break;
        case "stun":
          applyStatus(currentTick, target, "stun", SCALE, effect.durationTicks ?? 0, effect.maxStacks ?? 1, actionId, source);
          break;
        case "slow":
          applyStatus(currentTick, target, "slow", effect.baseValue ?? 0, effect.durationTicks ?? 0, effect.maxStacks ?? 1, actionId, source);
          break;
        case "damage_reduction":
          applyStatus(currentTick, target, "damage_reduction", effect.baseValue ?? 0, effect.durationTicks ?? 0, effect.maxStacks ?? 1, actionId, source);
          break;
        case "buff_stat":
          applyStatModifier(currentTick, target, effect.stat!, effect.modifierMode!, effect.baseValue ?? 0, effect.durationTicks ?? 0, effect.maxStacks ?? 1, effect.removeOnMove ?? false, actionId, source);
          break;
        case "debuff_stat":
          applyStatModifier(currentTick, target, effect.stat!, effect.modifierMode!, -(effect.baseValue ?? 0), effect.durationTicks ?? 0, effect.maxStacks ?? 1, effect.removeOnMove ?? false, actionId, source);
          break;
        case "apply_dot":
          applyDot(currentTick, source, target, effect, actionId);
          break;
        case "cleanse":
          applyCleanse(currentTick, target, actionId, source);
          break;
        case "dash":
          applyDisplacement(currentTick, source, target, effect.distance ?? 0, "dash", actionId);
          break;
        case "retreat":
          if (effect.onlyWhenEngaged === true) {
            const nearest = nearestEnemyTo(target);
            if (nearest === undefined || manhattanDistance(geometry, target.position, nearest.position) > 1) break;
          }
          applyDisplacement(currentTick, source, target, effect.distance ?? 0, "retreat", actionId);
          break;
        case "knockback":
          applyDisplacement(currentTick, source, target, effect.distance ?? 0, "knockback", actionId);
          break;
        case "summon":
          spawnSummon(currentTick, source, effect, actionId);
          break;
      }
    }
  }

  function spawnSummon(currentTick: number, source: ActiveUnit, effect: CombatEffect, actionId: string): void {
    if (effect.summon === undefined) return;
    const freeCell = [...orthogonalNeighbors(geometry, source.position), source.position]
      .find((candidate) => !units.some((unit) => !unit.isDead && unit.position === candidate) || candidate === source.position && false);
    if (freeCell === undefined) return;
    const summon: ActiveUnit = {
      id: `${actionId}:summon:${effect.summon.id}`, side: source.side, heroId: effect.summon.id, hero: undefined,
      skillId: undefined, skillEffects: [], castTimeTicks: 0,
      baseStats: { ...zeroStats(), max_hp: effect.summon.maxHp, attack_damage: 0, attack_speed: SCALE, move_speed: SCALE, armor: 0, magic_resist: 0, max_mana: 0, starting_mana: 0, crit_chance: 0, crit_multiplier: SCALE, skill_power: 0 },
      position: freeCell, hp: effect.summon.maxHp, maxHp: effect.summon.maxHp, mana: 0, startingMana: 0,
      isDead: false, isSummon: true, summonExpiryTick: currentTick + effect.summon.durationTicks, nextActionTick: currentTick,
      moved: false, stationaryTicks: 0, basicAttackCount: 0, modifiers: [], statusEffects: [], shields: [], dots: [], triggerState: new Map(),
    };
    units.push(summon);
    unitsById.set(summon.id, summon);
    pushEvent(currentTick, "UNIT_SPAWNED", { unitId: summon.id, side: summon.side, position: summon.position, hp: summon.hp, summon: true });
  }

  function zeroStats(): Record<CombatStat, number> {
    return { max_hp: 0, attack_damage: 0, attack_speed: 0, armor: 0, magic_resist: 0, move_speed: 0, starting_mana: 0, max_mana: 0, crit_chance: 0, crit_multiplier: 0, skill_power: 0 };
  }

  function fireTrigger(kind: CombatTriggerKind, currentTick: number, source: ActiveUnit, related: ActiveUnit, actionId: string, options?: { readonly skip?: boolean }): void {
    if (options?.skip) return;
    for (const owned of triggersFor(kind)) {
      if (owned.ownerId !== source.id) continue;
      if (owned.trigger.holderHeroIds !== undefined && !owned.trigger.holderHeroIds.includes(source.heroId)) continue;
      const state = triggerRuntimeState(owned.ownerId, owned.trigger.id);
      if ((owned.trigger.oncePerCombat === true || owned.trigger.oncePerOwnerPerCombat === true) && state.used) continue;
      if (currentTick < state.cooldownReadyTick) continue;
      if (kind === "on_hp_below" && owned.trigger.thresholdPercent !== undefined) {
        if (related.maxHp === 0 || (related.hp * SCALE) / related.maxHp > owned.trigger.thresholdPercent) continue;
      }
      if (kind === "on_every_nth_basic_attack") {
        state.attackCounter += 1;
        if (owned.trigger.attackCount === undefined || state.attackCounter % owned.trigger.attackCount !== 0) continue;
      }
      state.used = true;
      if (owned.trigger.cooldownTicks !== undefined) state.cooldownReadyTick = currentTick + owned.trigger.cooldownTicks;
      for (const effect of owned.trigger.effects) applyEffect(currentTick, source, effect, `${actionId}:${owned.trigger.id}`);
    }
  }

  for (const unit of [...units].sort((left, right) => left.id.localeCompare(right.id))) {
    fireTrigger("on_combat_start", 0, unit, unit, `start:${unit.id}`);
  }

  let currentTick = 0;
  let winner: "player" | "enemy" | undefined;

  function checkVictory(): "player" | "enemy" | undefined {
    const playerAlive = activeUnitsOfSide("player").length > 0;
    const enemyAlive = activeUnitsOfSide("enemy").length > 0;
    if (!playerAlive && !enemyAlive) return "enemy";
    if (!playerAlive) return "enemy";
    if (!enemyAlive) return "player";
    return undefined;
  }

  while (currentTick <= maxTicks) {
    const victor = checkVictory();
    if (victor !== undefined) { winner = victor; break; }
    if (currentTick === maxTicks) { winner = "enemy"; break; }

    for (const unit of [...units].sort((left, right) => left.id.localeCompare(right.id))) {
      if (unit.isDead) continue;
      if (unit.summonExpiryTick !== undefined && currentTick >= unit.summonExpiryTick) {
        killUnit(currentTick, undefined, unit, `expire:${unit.id}`);
        continue;
      }

      for (const dot of unit.dots) {
        if (currentTick >= dot.nextTickAt && currentTick <= dot.endTick) {
          const source = unitsById.get(dot.sourceId) ?? unit;
          applyDamage(currentTick, source, unit, dot.perTick, dot.damageType, dot.id);
          dot.nextTickAt += dot.intervalTicks;
        }
      }
      unit.dots = unit.dots.filter((dot) => currentTick < dot.endTick);

      for (const modifier of unit.modifiers) {
        if (modifier.removeOnMove && unit.moved) {
          pushEvent(currentTick, "STATUS_REMOVED", { stat: modifier.stat }, { targetUnitId: unit.id });
        }
      }
      unit.modifiers = unit.modifiers.filter((modifier) => currentTick < modifier.endTick && !(modifier.removeOnMove && unit.moved));
      unit.statusEffects = unit.statusEffects.filter((status) => currentTick < status.endTick);
      unit.shields = unit.shields.filter((shield) => currentTick < shield.endTick && shield.amount > 0);
      unit.moved = false;

      if (unit.hero !== undefined) fireTrigger("on_hp_below", currentTick, unit, unit, `hp:${unit.id}`);

      if (isStunned(unit)) { unit.stationaryTicks += 1; continue; }

      if (currentTick < unit.nextActionTick) { unit.stationaryTicks += 1; continue; }

      const target = nearestEnemyTo(unit);
      if (target === undefined) continue;
      unit.lockedTargetId = target.id;
      const distance = manhattanDistance(geometry, unit.position, target.position);
      const range = Math.max(1, Math.round((unit.hero?.base_stats.attack_range ?? 1)));

      if (distance <= range) {
        unit.stationaryTicks += 1;
        const maxMana = statValue(unit, "max_mana");
        if (maxMana > 0 && unit.mana >= maxMana && unit.skillEffects.length > 0) {
          unit.mana = 0;
          const castTicks = unit.castTimeTicks;
          unit.nextActionTick = currentTick + castTicks;
          const actionId = `cast:${unit.id}:${currentTick}`;
          pushEvent(currentTick, "CAST_STARTED", { skillId: unit.skillId ?? "" }, {
            actionId, sourceUnitId: unit.id, targetUnitId: target.id, sourcePosition: unit.position, targetPosition: target.position,
            releaseTick: currentTick, impactTick: currentTick + castTicks,
          });
          pushEvent(currentTick + castTicks, "CAST_RELEASED", { skillId: unit.skillId ?? "" }, {
            actionId, sourceUnitId: unit.id, targetUnitId: target.id, sourcePosition: unit.position, targetPosition: target.position, impactTick: currentTick + castTicks,
          });
          for (const effect of unit.skillEffects) applyEffect(currentTick + castTicks, unit, effect, actionId);
          fireTrigger("on_cast_resolve", currentTick + castTicks, unit, target, actionId);
        } else {
          const attackSpeed = Math.max(1, statValue(unit, "attack_speed"));
          const attackInterval = Math.max(BASIC_ATTACK_MIN_INTERVAL_TICKS, Math.round((tickRate * SCALE) / attackSpeed));
          unit.nextActionTick = currentTick + attackInterval;
          unit.basicAttackCount += 1;
          const critChance = statValue(unit, "crit_chance");
          const isCrit = rng.nextInt(SCALE) < critChance;
          const critMultiplier = statValue(unit, "crit_multiplier");
          const baseDamage = isCrit ? Math.round((statValue(unit, "attack_damage") * critMultiplier) / SCALE) : statValue(unit, "attack_damage");
          const flightTicks = range > 1 ? Math.max(2, distance * 2) : 0;
          const impactTick = currentTick + flightTicks;
          const actionId = `attack:${unit.id}:${currentTick}`;
          pushEvent(currentTick, "ATTACK_STARTED", { isCrit }, {
            actionId, sourceUnitId: unit.id, targetUnitId: target.id, sourcePosition: unit.position, targetPosition: target.position,
            releaseTick: currentTick, impactTick,
          });
          unit.mana = Math.min(statValue(unit, "max_mana"), unit.mana + MANA_PER_BASIC_ATTACK);
          applyDamage(impactTick, unit, target, baseDamage, "physical", actionId);
          fireTrigger("on_basic_attack", impactTick, unit, target, actionId);
          if (isCrit) fireTrigger("on_critical_basic_attack", impactTick, unit, target, actionId);
          fireTrigger("on_every_nth_basic_attack", impactTick, unit, target, actionId);
        }
      } else {
        const neighbors = orthogonalNeighbors(geometry, unit.position)
          .filter((cell) => !units.some((other) => !other.isDead && other.position === cell));
        if (neighbors.length > 0) {
          const nextCell = [...neighbors].sort((left, right) => {
            const distanceDelta = manhattanDistance(geometry, left, target.position) - manhattanDistance(geometry, right, target.position);
            return distanceDelta !== 0 ? distanceDelta : left - right;
          })[0]!;
          const moveSpeed = Math.max(1, statValue(unit, "move_speed"));
          const moveTicks = Math.max(BASIC_ATTACK_MIN_INTERVAL_TICKS, Math.round((tickRate * SCALE) / moveSpeed));
          const from = unit.position;
          unit.position = nextCell;
          unit.nextActionTick = currentTick + moveTicks;
          unit.moved = true;
          unit.stationaryTicks = 0;
          pushEvent(currentTick, "MOVE_STARTED", { from, to: nextCell }, { sourceUnitId: unit.id, sourcePosition: from, targetPosition: nextCell });
          pushEvent(currentTick + moveTicks, "MOVE_COMPLETED", { from, to: nextCell }, { sourceUnitId: unit.id, targetPosition: nextCell });
        } else {
          unit.stationaryTicks += 1;
        }
      }
    }

    currentTick += 1;
  }

  const finalWinner = winner ?? "enemy";
  const finalTick = currentTick;
  const survivingEnemies = activeUnitsOfSide("enemy").length;
  pushEvent(finalTick, "COMBAT_ENDED", { winner: finalWinner });

  const validEvents = events.filter((event) => event.tick <= finalTick);
  validEvents.sort((left, right) => {
    if (left.tick !== right.tick) return left.tick - right.tick;
    if (left.type === "COMBAT_ENDED" && right.type === "COMBAT_ENDED") return left.sequence - right.sequence;
    if (left.type === "COMBAT_ENDED") return 1;
    if (right.type === "COMBAT_ENDED") return -1;
    return left.sequence - right.sequence;
  });
  const sortedEvents = validEvents.map((event, index) => Object.freeze({ ...event, sequence: index }));

  const outcome: AdventureCombatOutcome = Object.freeze({
    round: snapshot.round,
    winner: finalWinner,
    survivingEnemyUnits: survivingEnemies,
    resultHash: sha256Hex({ snapshotHash: snapshot.snapshotHash, winner: finalWinner, finalTick, survivingEnemies }),
    finalTick,
    reason: finalTick >= maxTicks ? "timeout" : "elimination",
  });

  const playback: AdventureCombatPlayback = createAdventureCombatPlayback(snapshot, sortedEvents);

  return Object.freeze({ outcome, playback });
}

