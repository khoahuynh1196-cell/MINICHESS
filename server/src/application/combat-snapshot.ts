import type { CombatEffect, CombatImmunity, CombatPassive, CombatSnapshot, CombatUnit, CompiledCombatTrigger, CompiledContentBundle } from "@auto-battler/game-core";
import type { ItemInstance, LockedRoundSnapshot } from "./run-commands.js";

const SCALE = 1_000;

export interface BuildCombatSnapshotInput {
  readonly content: CompiledContentBundle;
  readonly lockedSnapshot: LockedRoundSnapshot;
  readonly combatId: string;
  readonly combatSeed: string;
  readonly rulesetVersion: string;
}

function requiredStat(stats: Readonly<Record<string, number>>, name: string): number {
  const value = stats[name];
  if (value === undefined) throw new Error(`CONTENT_STAT_MISSING:${name}`);
  return value;
}

function scale(value: number, multiplier: number): number {
  return Math.floor(value * multiplier / SCALE);
}

function scaleForStars(value: number, starMultipliers: Readonly<Record<string, Readonly<Record<string, number>>>>, stars: 1 | 2 | 3, stat: string): number {
  const tier = stars === 1 ? undefined : stars === 2 ? "two" : "three";
  return tier === undefined ? value : scale(value, starMultipliers[tier]?.[stat] ?? SCALE);
}

interface StatModifier {
  readonly stat: string;
  readonly mode: "flat" | "percent";
  readonly value: number;
}

function itemModifiers(content: CompiledContentBundle, items: readonly ItemInstance[], heroInstanceId: string): readonly StatModifier[] {
  const definitions = new Map([...content.normalItems, ...content.uniqueItems].map((item) => [item.id, item]));
  return items.flatMap((item) => {
    if (item.equippedHeroInstanceId !== heroInstanceId) return [];
    const modifiers = definitions.get(item.itemId)?.stat_modifiers;
    if (!Array.isArray(modifiers)) return [];
    return modifiers.flatMap((modifier) => typeof modifier === "object" && modifier !== null
      && typeof modifier.stat === "string" && (modifier.mode === "flat" || modifier.mode === "percent") && typeof modifier.value === "number"
      ? [{ stat: modifier.stat, mode: modifier.mode, value: modifier.value }]
      : []);
  });
}

function itemPassives(content: CompiledContentBundle, items: readonly ItemInstance[], heroInstanceId: string): readonly CombatPassive[] {
  const definitions = new Map([...content.normalItems, ...content.uniqueItems].map((item) => [item.id, item]));
  return items.flatMap((item) => {
    if (item.equippedHeroInstanceId !== heroInstanceId) return [];
    const definition = definitions.get(item.itemId);
    if (definition === undefined) throw new Error(`CONTENT_ITEM_MISSING:${item.itemId}`);
    return definition.triggers.map((trigger) => Object.freeze({
      ownerId: definition.id,
      triggerId: trigger.id,
      trigger: trigger.trigger,
      effects: trigger.effects,
      ...(trigger.cooldownTicks === undefined ? {} : { cooldownTicks: trigger.cooldownTicks }),
      ...(trigger.thresholdPercent === undefined ? {} : { thresholdPercent: trigger.thresholdPercent }),
      ...(trigger.attackCount === undefined ? {} : { attackCount: trigger.attackCount }),
      ...(trigger.stationaryIntervalTicks === undefined ? {} : { stationaryIntervalTicks: trigger.stationaryIntervalTicks }),
      ...(trigger.oncePerCombat === undefined ? {} : { oncePerCombat: trigger.oncePerCombat }),
      ...(trigger.oncePerOwnerPerCombat === undefined ? {} : { oncePerOwnerPerCombat: trigger.oncePerOwnerPerCombat }),
      ...(trigger.basicOnly === undefined ? {} : { basicOnly: trigger.basicOnly }),
      ...(trigger.lifestealPerThousand === undefined ? {} : { lifestealPerThousand: trigger.lifestealPerThousand }),
    }));
  });
}

function applyStatModifiers(value: number, stat: string, modifiers: readonly StatModifier[]): number {
  return modifiers.filter((modifier) => modifier.stat === stat).reduce((current, modifier) =>
    modifier.mode === "flat" ? current + modifier.value : scale(current, SCALE + modifier.value), value);
}

function traitEffectModifiers(value: unknown, heroId: string): readonly StatModifier[] {
  if (typeof value !== "object" || value === null || !Array.isArray((value as { effects?: unknown }).effects)) return [];
  return (value as { effects: readonly unknown[] }).effects.flatMap((effect) => {
    if (typeof effect !== "object" || effect === null) return [];
    const record = effect as Record<string, unknown>;
    const holderHeroIds = record.holder_hero_ids;
    if (Array.isArray(holderHeroIds) && !holderHeroIds.some((holderHeroId: unknown) => holderHeroId === heroId)) return [];
    return record.primitive === "buff_stat"
      && record.target === "all_trait_holders"
      && typeof record.stat === "string"
      && (record.mode === "flat" || record.mode === "percent")
      && typeof record.base_value === "number"
      ? [{ stat: record.stat, mode: record.mode, value: record.base_value }]
      : [];
  });
}

function traitModifiersByHero(content: CompiledContentBundle, board: readonly (LockedRoundSnapshot["board"][number])[]): ReadonlyMap<string, readonly StatModifier[]> {
  const heroInstances = board.flatMap((instance) => {
    if (instance === null) return [];
    const hero = content.heroesById.get(instance.heroId);
    return hero === undefined ? [] : [{ instance, hero }];
  });
  const distinctHeroIdsByTrait = new Map<string, Set<string>>();
  for (const { hero } of heroInstances) {
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const ids = distinctHeroIdsByTrait.get(traitId) ?? new Set<string>();
      ids.add(hero.id);
      distinctHeroIdsByTrait.set(traitId, ids);
    }
  }
  const modifiersByHero = new Map<string, readonly StatModifier[]>();
  for (const { instance, hero } of heroInstances) {
    const modifiers: StatModifier[] = [];
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const trait = content.traitsById.get(traitId);
      const breakpoints = trait?.breakpoints;
      if (!Array.isArray(breakpoints)) continue;
      const unlocked = breakpoints.filter((breakpoint) => typeof breakpoint === "object" && breakpoint !== null
        && typeof (breakpoint as Record<string, unknown>).count === "number"
        && (breakpoint as Record<string, unknown>).count as number <= (distinctHeroIdsByTrait.get(traitId)?.size ?? 0))
        .at(-1);
      if (unlocked !== undefined) modifiers.push(...traitEffectModifiers(unlocked, hero.id));
    }
    modifiersByHero.set(instance.instanceId, modifiers);
  }
  return modifiersByHero;
}

function traitPassivesByHero(content: CompiledContentBundle, board: readonly (LockedRoundSnapshot["board"][number])[]): ReadonlyMap<string, readonly CombatPassive[]> {
  const heroInstances = board.flatMap((instance) => {
    if (instance === null) return [];
    const hero = content.heroesById.get(instance.heroId);
    return hero === undefined ? [] : [{ instance, hero }];
  });
  const distinctHeroIdsByTrait = new Map<string, Set<string>>();
  for (const { hero } of heroInstances) {
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const ids = distinctHeroIdsByTrait.get(traitId) ?? new Set<string>();
      ids.add(hero.id);
      distinctHeroIdsByTrait.set(traitId, ids);
    }
  }
  const passivesByHero = new Map<string, readonly CombatPassive[]>();
  for (const { instance, hero } of heroInstances) {
    const passives: CombatPassive[] = [];
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const breakpoints = content.traitsById.get(traitId)?.breakpoints;
      if (!Array.isArray(breakpoints)) continue;
      const unlocked = breakpoints.filter((breakpoint) => typeof breakpoint === "object" && breakpoint !== null
        && typeof (breakpoint as Record<string, unknown>).count === "number"
        && (breakpoint as Record<string, unknown>).count as number <= (distinctHeroIdsByTrait.get(traitId)?.size ?? 0))
        .at(-1) as { readonly triggers?: readonly CompiledCombatTrigger[] } | undefined;
      for (const trigger of unlocked?.triggers ?? []) {
        if (trigger.holderHeroIds !== undefined && !trigger.holderHeroIds.includes(hero.id)) continue;
        passives.push(Object.freeze({
          ownerId: traitId,
          triggerId: trigger.id,
          trigger: trigger.trigger,
          effects: trigger.effects,
          ...(trigger.cooldownTicks === undefined ? {} : { cooldownTicks: trigger.cooldownTicks }),
          ...(trigger.thresholdPercent === undefined ? {} : { thresholdPercent: trigger.thresholdPercent }),
          ...(trigger.attackCount === undefined ? {} : { attackCount: trigger.attackCount }),
          ...(trigger.stationaryIntervalTicks === undefined ? {} : { stationaryIntervalTicks: trigger.stationaryIntervalTicks }),
          ...(trigger.oncePerCombat === undefined ? {} : { oncePerCombat: trigger.oncePerCombat }),
          ...(trigger.oncePerOwnerPerCombat === undefined ? {} : { oncePerOwnerPerCombat: trigger.oncePerOwnerPerCombat }),
          ...(trigger.basicOnly === undefined ? {} : { basicOnly: trigger.basicOnly }),
          ...(trigger.lifestealPerThousand === undefined ? {} : { lifestealPerThousand: trigger.lifestealPerThousand }),
        }));
      }
    }
    passivesByHero.set(instance.instanceId, Object.freeze(passives));
  }
  return passivesByHero;
}

function traitImmunitiesByHero(content: CompiledContentBundle, board: readonly (LockedRoundSnapshot["board"][number])[]): ReadonlyMap<string, readonly CombatImmunity[]> {
  const heroInstances = board.flatMap((instance) => {
    if (instance === null) return [];
    const hero = content.heroesById.get(instance.heroId);
    return hero === undefined ? [] : [{ instance, hero }];
  });
  const distinctHeroIdsByTrait = new Map<string, Set<string>>();
  for (const { hero } of heroInstances) {
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const ids = distinctHeroIdsByTrait.get(traitId) ?? new Set<string>();
      ids.add(hero.id);
      distinctHeroIdsByTrait.set(traitId, ids);
    }
  }
  const immunitiesByHero = new Map<string, readonly CombatImmunity[]>();
  for (const { instance, hero } of heroInstances) {
    const immunities = new Set<CombatImmunity>();
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const breakpoints = content.traitsById.get(traitId)?.breakpoints;
      if (!Array.isArray(breakpoints)) continue;
      const unlocked = breakpoints.filter((breakpoint) => typeof breakpoint === "object" && breakpoint !== null
        && typeof (breakpoint as Record<string, unknown>).count === "number"
        && (breakpoint as Record<string, unknown>).count as number <= (distinctHeroIdsByTrait.get(traitId)?.size ?? 0))
        .at(-1) as { readonly immunities?: readonly CombatImmunity[] } | undefined;
      for (const immunity of unlocked?.immunities ?? []) immunities.add(immunity);
    }
    immunitiesByHero.set(instance.instanceId, Object.freeze([...immunities].sort()));
  }
  return immunitiesByHero;
}

function traitHealShieldPowerByHero(content: CompiledContentBundle, board: readonly (LockedRoundSnapshot["board"][number])[]): ReadonlyMap<string, number> {
  const heroInstances = board.flatMap((instance) => {
    if (instance === null) return [];
    const hero = content.heroesById.get(instance.heroId);
    return hero === undefined ? [] : [{ instance, hero }];
  });
  const distinctHeroIdsByTrait = new Map<string, Set<string>>();
  for (const { hero } of heroInstances) {
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const ids = distinctHeroIdsByTrait.get(traitId) ?? new Set<string>();
      ids.add(hero.id);
      distinctHeroIdsByTrait.set(traitId, ids);
    }
  }
  const valuesByHero = new Map<string, number>();
  for (const { instance, hero } of heroInstances) {
    let value = 0;
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const breakpoints = content.traitsById.get(traitId)?.breakpoints;
      const unlocked = Array.isArray(breakpoints) ? breakpoints.filter((breakpoint) => typeof breakpoint === "object" && breakpoint !== null
        && typeof (breakpoint as Record<string, unknown>).count === "number"
        && (breakpoint as Record<string, unknown>).count as number <= (distinctHeroIdsByTrait.get(traitId)?.size ?? 0)).at(-1) : undefined;
      const effects = typeof unlocked === "object" && unlocked !== null && Array.isArray((unlocked as { effects?: unknown }).effects)
        ? (unlocked as { effects: readonly unknown[] }).effects : [];
      for (const effect of effects) {
        const record = typeof effect === "object" && effect !== null ? effect as Record<string, unknown> : undefined;
        if (record?.primitive === "amplify_heal_shield" && record.target === "all_trait_holders" && typeof record.base_value === "number") {
          value += record.base_value;
        }
      }
    }
    valuesByHero.set(instance.instanceId, value);
  }
  return valuesByHero;
}

function toCombatSummon(value: unknown): CombatEffect["summon"] | undefined {
  if (typeof value !== "object" || value === null) return undefined;
  const raw = value as Record<string, unknown>;
  if (typeof raw.id !== "string" || typeof raw.max_hp !== "number" || typeof raw.duration_ticks !== "number") return undefined;
  return { id: raw.id, maxHp: raw.max_hp, durationTicks: raw.duration_ticks };
}

function toCombatEffect(rawEffect: { readonly id: string; readonly primitive: string; readonly target: string; readonly [key: string]: unknown }): CombatEffect {
  const summon = toCombatSummon(rawEffect.summon);
  return {
    id: rawEffect.id,
    primitive: rawEffect.primitive as CombatEffect["primitive"],
    target: rawEffect.target as CombatEffect["target"],
    ...(typeof rawEffect.base_value === "number" ? { baseValue: rawEffect.base_value } : {}),
    ...(typeof rawEffect.duration_ticks === "number" ? { durationTicks: rawEffect.duration_ticks } : {}),
    ...(typeof rawEffect.max_stacks === "number" ? { maxStacks: rawEffect.max_stacks } : {}),
    ...(typeof rawEffect.interval_ticks === "number" ? { intervalTicks: rawEffect.interval_ticks } : {}),
    ...(typeof rawEffect.damage_type === "string" ? { damageType: rawEffect.damage_type as NonNullable<CombatEffect["damageType"]> } : {}),
    ...(typeof rawEffect.stat === "string" ? { stat: rawEffect.stat as NonNullable<CombatEffect["stat"]> } : {}),
    ...(typeof rawEffect.mode === "string" ? { modifierMode: rawEffect.mode as NonNullable<CombatEffect["modifierMode"]> } : {}),
    ...(typeof rawEffect.distance === "number" ? { distance: rawEffect.distance } : {}),
    ...(summon === undefined ? {} : { summon }),
    ...(rawEffect.scales_with_skill_power === true ? { scalesWithSkillPower: true } : {}),
    ...(rawEffect.scales_with_max_hp === true ? { scalesWithMaxHp: true } : {}),
    ...(rawEffect.scales_with_target_max_hp === true ? { scalesWithTargetMaxHp: true } : {}),
    ...(rawEffect.only_when_engaged === true ? { onlyWhenEngaged: true } : {}),
    ...(rawEffect.cleanseable === true ? { cleanseable: true } : {}),
  };
}

function toCombatUnit(content: CompiledContentBundle, heroId: string, id: string, side: "player" | "enemy", position: number, multiplier: number, stars: 1 | 2 | 3, modifiers: readonly StatModifier[], passives: readonly CombatPassive[] = [], attackSpeedBonus = 0, immunities: readonly CombatImmunity[] = [], healShieldPower = 0): CombatUnit {
  const hero = content.heroesById.get(heroId);
  if (hero === undefined) throw new Error(`CONTENT_HERO_MISSING:${heroId}`);
  const skill = content.skillsById.get(hero.skill_id);
  if (skill === undefined) throw new Error(`CONTENT_SKILL_MISSING:${hero.skill_id}`);
  const stats = hero.base_stats;
  const starStat = (name: string, applyFormationMultiplier = false) => applyStatModifiers(
    scale(scaleForStars(requiredStat(stats, name), hero.star_multipliers, stars, name), applyFormationMultiplier ? multiplier : SCALE),
    name,
    modifiers,
  );
  return {
    id,
    side,
    position,
    maxHp: starStat("max_hp", true),
    attackDamage: starStat("attack_damage", true),
    attackSpeed: scale(starStat("attack_speed", true), SCALE + attackSpeedBonus),
    armor: starStat("armor", true),
    magicResist: starStat("magic_resist", true),
    attackRange: starStat("attack_range"),
    moveSpeed: starStat("move_speed", true),
    startingMana: starStat("starting_mana"),
    maxMana: starStat("max_mana"),
    critChance: starStat("crit_chance"),
    critMultiplier: starStat("crit_multiplier"),
    skillPower: starStat("skill_power", true),
    skill: { id: skill.id, castTimeTicks: skill.cast_time_ticks, effects: skill.effects.map(toCombatEffect) },
    passives,
    ...(immunities.length === 0 ? {} : { immunities }),
    ...(healShieldPower === 0 ? {} : { healShieldPower }),
  };
}

const PLAYER_FORMATION_SIZE = 16;
const PLAYER_GLOBAL_START = 16;

export function buildCombatSnapshot(input: BuildCombatSnapshotInput): CombatSnapshot {
  if (input.lockedSnapshot.board.length > PLAYER_FORMATION_SIZE) throw new Error("GAME_RULE_VIOLATION");
  const encounter = input.content.encounters.find((candidate) => candidate.round === input.lockedSnapshot.round);
  if (encounter === undefined || encounter.enemy_composition === undefined) throw new Error(`ENCOUNTER_MISSING:${input.lockedSnapshot.round}`);
  const traitModifiers = traitModifiersByHero(input.content, input.lockedSnapshot.board);
  const traitPassives = traitPassivesByHero(input.content, input.lockedSnapshot.board);
  const traitImmunities = traitImmunitiesByHero(input.content, input.lockedSnapshot.board);
  const traitHealShieldPower = traitHealShieldPowerByHero(input.content, input.lockedSnapshot.board);
  const playerUnits = input.lockedSnapshot.board.flatMap((hero, localPosition) => hero === null
    ? []
    : [toCombatUnit(input.content, hero.heroId, `player:${hero.instanceId}`, "player", PLAYER_GLOBAL_START + localPosition, SCALE, hero.stars ?? 1, [...(traitModifiers.get(hero.instanceId) ?? []), ...itemModifiers(input.content, input.lockedSnapshot.items ?? [], hero.instanceId)], [...(traitPassives.get(hero.instanceId) ?? []), ...itemPassives(input.content, input.lockedSnapshot.items ?? [], hero.instanceId)], 0, traitImmunities.get(hero.instanceId) ?? [], traitHealShieldPower.get(hero.instanceId) ?? 0)]);
  const enemyUnits = encounter.enemy_composition.map((enemy, index) => toCombatUnit(
    input.content,
    enemy.hero_id,
    `enemy:${encounter.id}:${index}`,
    "enemy",
    enemy.position,
    enemy.stat_multiplier,
    1,
    [],
    [],
    encounter.affix?.kind === "attack_speed_multiplier" ? encounter.affix.value : 0,
  ));
  return {
    combatId: input.combatId,
    contentVersion: input.lockedSnapshot.contentVersion,
    rulesetVersion: input.rulesetVersion,
    combatSeed: input.combatSeed,
    defenderSide: "enemy",
    units: [...playerUnits, ...enemyUnits],
  };
}
