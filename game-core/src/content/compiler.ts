import { validateEffectDefinition, type CombatEffect } from "../effects/definitions.js";
import { ENCOUNTER_BIOMES } from "./types.js";
import type {
  CompiledContentBundle,
  CompiledCombatTrigger,
  CompiledItem,
  CompiledUniqueItem,
  RawContentBundle,
  RawEffect,
  RawHero,
  RawIdentifiedContent,
  RawEncounter,
  RawEncounterAffix,
  RawEncounterEnemy,
  RawSkill,
  RawUniqueItem,
  RawVisualProfile,
} from "./types.js";

const REQUIRED_STATS = [
  "max_hp", "attack_damage", "attack_speed", "armor", "magic_resist", "attack_range",
  "move_speed", "starting_mana", "max_mana", "crit_chance", "crit_multiplier", "skill_power",
] as const;
const REQUIRED_ANCHORS = ["head", "chest", "back", "feet", "weapon"] as const;
const REQUIRED_ANIMATIONS = ["idle", "move", "basic_attack", "hit", "skill_cast", "death"] as const;
const ITEM_MODIFIER_STATS = [
  "max_hp", "attack_damage", "attack_speed", "armor", "magic_resist", "move_speed",
  "starting_mana", "max_mana", "crit_chance", "crit_multiplier", "skill_power",
] as const;
const TRIGGER_KIND_BY_LEGACY_NAME: Readonly<Record<string, CompiledCombatTrigger["trigger"]>> = {
  combat_start: "on_combat_start",
  basic_attack: "on_basic_attack",
  skill_cast: "on_cast_resolve",
  first_skill_cast: "on_cast_resolve",
  hp_below_percent: "on_hp_below",
  every_third_basic_attack: "on_every_nth_basic_attack",
  basic_attack_damage: "on_damage_dealt",
  on_combat_start: "on_combat_start",
  on_basic_attack: "on_basic_attack",
  on_cast_resolve: "on_cast_resolve",
  on_hp_below: "on_hp_below",
  on_every_nth_basic_attack: "on_every_nth_basic_attack",
  on_damage_dealt: "on_damage_dealt",
  on_critical_basic_attack: "on_critical_basic_attack",
  on_heal_or_shield: "on_heal_or_shield",
  on_death: "on_death",
  on_kill: "on_kill",
  on_stationary_interval: "on_stationary_interval",
  critical_basic_attack: "on_critical_basic_attack",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireSafeInteger(value: unknown, label: string, minimum = 0): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
  return value;
}

function requireSafeIntegerNumbers(value: unknown, label: string): void {
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => requireSafeIntegerNumbers(entry, `${label}[${index}]`));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) requireSafeIntegerNumbers(entry, `${label}.${key}`);
  }
}

function requireIdentified(value: unknown, label: string): RawIdentifiedContent {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  requireString(value.id, `${label}.id`);
  return value as RawIdentifiedContent;
}

function requireUniqueIds(values: readonly RawIdentifiedContent[], label: string): void {
  const ids = new Set<string>();
  for (const value of values) {
    if (ids.has(value.id)) throw new Error(`Duplicate ${label} ID: ${value.id}`);
    ids.add(value.id);
  }
}

function requireHero(value: unknown): RawHero {
  const hero = requireIdentified(value, "hero") as RawHero;
  const raw = hero as Record<string, unknown>;
  requireString((hero as Record<string, unknown>).display_key, `${hero.id}.display_key`);
  requireString(hero.species_trait_id, `${hero.id}.species_trait_id`);
  requireString(hero.class_trait_id, `${hero.id}.class_trait_id`);
  const rarity = requireSafeInteger(raw.rarity, `${hero.id}.rarity`, 1);
  if (rarity > 5) throw new Error(`${hero.id}.rarity must be <= 5`);
  const isUniqueHero = raw.is_unique_hero;
  if (typeof isUniqueHero !== "boolean") throw new Error(`${hero.id}.is_unique_hero must be boolean`);
  const cost = requireSafeInteger(hero.cost, `${hero.id}.cost`);
  if (isUniqueHero ? cost !== 0 : cost < 1 || cost > 3) {
    throw new Error(isUniqueHero ? `${hero.id}.Unique hero cost must be 0` : `${hero.id}.cost must be between 1 and 3`);
  }
  requireArray(raw.tags, `${hero.id}.tags`).forEach((tag, index) => requireString(tag, `${hero.id}.tags[${index}]`));
  if (!isRecord(hero.base_stats)) throw new Error(`${hero.id}.base_stats must be an object`);
  for (const stat of REQUIRED_STATS) requireSafeInteger(hero.base_stats[stat], `${hero.id}.base_stats.${stat}`, stat === "attack_range" || stat === "move_speed" || stat === "max_hp" || stat === "max_mana" ? 1 : 0);
  if (!isRecord(hero.star_multipliers)) throw new Error(`${hero.id}.star_multipliers must be an object`);
  requireString(hero.skill_id, `${hero.id}.skill_id`);
  requireString(hero.visual_profile_id, `${hero.id}.visual_profile_id`);
  return hero;
}

function requireSkill(value: unknown): RawSkill {
  const skill = requireIdentified(value, "skill") as RawSkill;
  requireSafeInteger(skill.cast_time_ticks, `${skill.id}.cast_time_ticks`, 1);
  requireArray(skill.effects, `${skill.id}.effects`).forEach((effect) => validateEffectDefinition(normalizeEffect(effect)));
  return skill;
}

function requireVisualProfile(value: unknown): RawVisualProfile {
  const profile = requireIdentified(value, "visual profile") as RawVisualProfile;
  requireString((profile as Record<string, unknown>).sprite_key, `${profile.id}.sprite_key`);
  requireString((profile as Record<string, unknown>).portrait_key, `${profile.id}.portrait_key`);
  requireString((profile as Record<string, unknown>).ability_icon_key, `${profile.id}.ability_icon_key`);
  requireString((profile as Record<string, unknown>).vfx_key, `${profile.id}.vfx_key`);
  const anchors = requireArray(profile.anchors, `${profile.id}.anchors`).map((anchor) => requireString(anchor, `${profile.id}.anchor`));
  const animations = requireArray(profile.animations, `${profile.id}.animations`).map((animation) => requireString(animation, `${profile.id}.animation`));
  for (const anchor of REQUIRED_ANCHORS) if (!anchors.includes(anchor)) throw new Error(`${profile.id} is missing ${anchor} anchor`);
  for (const animation of REQUIRED_ANIMATIONS) if (!animations.includes(animation)) throw new Error(`${profile.id} is missing ${animation} animation`);
  return profile;
}

function requireTrait(value: unknown): RawIdentifiedContent {
  const trait = requireIdentified(value, "trait");
  const raw = trait as Record<string, unknown>;
  const kind = requireString(raw.kind, `${trait.id}.kind`);
  if (kind !== "species" && kind !== "class") throw new Error(`${trait.id}.kind must be species or class`);
  const breakpoints = requireArray(raw.breakpoints, `${trait.id}.breakpoints`);
  if (breakpoints.length === 0) throw new Error(`${trait.id}.breakpoints must not be empty`);
  let previousUnits = 0;
  const compiledBreakpoints = breakpoints.map((breakpoint, index) => {
    if (!isRecord(breakpoint)) throw new Error(`${trait.id}.breakpoints[${index}] must be an object`);
    const count = requireSafeInteger(breakpoint.count, `${trait.id}.breakpoint.count`, 1);
    requireArray(breakpoint.effects, `${trait.id}.breakpoint.effects`);
    if (count <= previousUnits) throw new Error(`${trait.id}.breakpoints must be strictly increasing`);
    previousUnits = count;
    const triggers = breakpoint.triggers === undefined
      ? []
      : requireArray(breakpoint.triggers, `${trait.id}.breakpoints[${index}].triggers`)
        .map((trigger, triggerIndex) => requireTrigger(trigger, `${trait.id}:breakpoint:${count}`, triggerIndex));
    const immunities = breakpoint.immunities === undefined
      ? []
      : requireArray(breakpoint.immunities, `${trait.id}.breakpoints[${index}].immunities`)
        .map((immunity, immunityIndex) => requireString(immunity, `${trait.id}.breakpoints[${index}].immunities[${immunityIndex}]`));
    for (const immunity of immunities) {
      if (immunity !== "knockback") throw new Error(`${trait.id}.breakpoints[${index}].immunities is invalid`);
    }
    return Object.freeze({ ...breakpoint, triggers: Object.freeze(triggers), immunities: Object.freeze(immunities) });
  });
  return Object.freeze({ ...trait, breakpoints: Object.freeze(compiledBreakpoints) });
}

function requireStatModifiers(raw: Record<string, unknown>, itemId: string): void {
  const modifiers = requireArray(raw.stat_modifiers, `${itemId}.stat_modifiers`);
  modifiers.forEach((modifier, index) => {
    if (!isRecord(modifier)) throw new Error(`${itemId}.stat_modifiers[${index}] must be an object`);
    const stat = requireString(modifier.stat, `${itemId}.stat_modifiers[${index}].stat`);
    if (!(ITEM_MODIFIER_STATS as readonly string[]).includes(stat)) throw new Error(`${itemId}.stat_modifiers[${index}].stat is invalid`);
    const mode = requireString(modifier.mode, `${itemId}.stat_modifiers[${index}].mode`);
    if (mode !== "flat" && mode !== "percent") throw new Error(`${itemId}.stat_modifiers[${index}].mode is invalid`);
    requireSafeInteger(modifier.value, `${itemId}.stat_modifiers[${index}].value`, 1);
  });
}

function requireTrigger(value: unknown, ownerId: string, index: number): CompiledCombatTrigger {
  if (!isRecord(value)) throw new Error(`${ownerId}.triggers[${index}] must be an object`);
  const sourceName = requireString(value.when ?? value.trigger, `${ownerId}.triggers[${index}].trigger`);
  const trigger = TRIGGER_KIND_BY_LEGACY_NAME[sourceName];
  if (trigger === undefined) throw new Error(`${ownerId}.triggers[${index}].trigger is invalid`);
  const oncePerCombat = value.once_per_combat === undefined ? sourceName === "first_skill_cast" : value.once_per_combat;
  if (typeof oncePerCombat !== "boolean") throw new Error(`${ownerId}.triggers[${index}].once_per_combat must be boolean`);
  const oncePerOwnerPerCombat = value.once_per_owner_per_combat;
  if (oncePerOwnerPerCombat !== undefined && typeof oncePerOwnerPerCombat !== "boolean") {
    throw new Error(`${ownerId}.triggers[${index}].once_per_owner_per_combat must be boolean`);
  }
  const cooldownTicks = value.cooldown_ticks === undefined ? undefined : requireSafeInteger(value.cooldown_ticks, `${ownerId}.triggers[${index}].cooldown_ticks`, 1);
  const thresholdPercent = trigger === "on_hp_below"
    ? requireSafeInteger(value.threshold_percent ?? value.threshold, `${ownerId}.triggers[${index}].threshold_percent`, 1)
    : undefined;
  if (thresholdPercent !== undefined && thresholdPercent > 1_000) throw new Error(`${ownerId}.triggers[${index}].threshold_percent must be <= 1000`);
  if (trigger === "on_hp_below" && oncePerCombat !== true) throw new Error(`${ownerId}.triggers[${index}].once_per_combat must be true for on_hp_below`);
  const attackCount = trigger === "on_every_nth_basic_attack"
    ? sourceName === "every_third_basic_attack" ? 3 : requireSafeInteger(value.attack_count, `${ownerId}.triggers[${index}].attack_count`, 1)
    : undefined;
  const stationaryIntervalTicks = trigger === "on_stationary_interval"
    ? requireSafeInteger(value.stationary_interval_ticks, `${ownerId}.triggers[${index}].stationary_interval_ticks`, 1)
    : undefined;
  const holderHeroIds = value.holder_hero_ids === undefined
    ? undefined
    : requireArray(value.holder_hero_ids, `${ownerId}.triggers[${index}].holder_hero_ids`)
      .map((heroId, heroIndex) => requireString(heroId, `${ownerId}.triggers[${index}].holder_hero_ids[${heroIndex}]`));
  const isLifesteal = trigger === "on_damage_dealt" && value.kind === "lifesteal";
  if (trigger === "on_damage_dealt" && !isLifesteal) throw new Error(`${ownerId}.triggers[${index}] only supports lifesteal`);
  const effects = isLifesteal ? [] : requireArray(value.effects, `${ownerId}.triggers[${index}].effects`).map(normalizeEffect);
  if (!isLifesteal && effects.length === 0) throw new Error(`${ownerId}.triggers[${index}].effects must not be empty`);
  return Object.freeze({
    id: typeof value.id === "string" && value.id.length > 0 ? value.id : `${ownerId}:trigger:${index}`,
    trigger,
    effects: Object.freeze(effects),
    ...(cooldownTicks === undefined ? {} : { cooldownTicks }),
    ...(thresholdPercent === undefined ? {} : { thresholdPercent }),
    ...(attackCount === undefined ? {} : { attackCount }),
    ...(stationaryIntervalTicks === undefined ? {} : { stationaryIntervalTicks }),
    ...(holderHeroIds === undefined ? {} : { holderHeroIds: Object.freeze(holderHeroIds) }),
    ...(oncePerCombat ? { oncePerCombat: true } : {}),
    ...(oncePerOwnerPerCombat === true ? { oncePerOwnerPerCombat: true } : {}),
    ...(sourceName === "basic_attack_damage" ? { basicOnly: true } : {}),
    ...(isLifesteal ? { lifestealPerThousand: requireSafeInteger(value.value, `${ownerId}.triggers[${index}].value`, 1) } : {}),
  });
}

function requireItemTriggers(raw: Record<string, unknown>, itemId: string): readonly CompiledCombatTrigger[] {
  const triggerValues = raw.triggers === undefined ? [] : requireArray(raw.triggers, `${itemId}.triggers`);
  const ruleValues = raw.rules === undefined ? [] : requireArray(raw.rules, `${itemId}.rules`);
  return Object.freeze([...triggerValues, ...ruleValues].map((trigger, index) => requireTrigger(trigger, itemId, index)));
}

function requireNormalItem(value: unknown): CompiledItem {
  const item = requireIdentified(value, "normal item");
  const raw = item as Record<string, unknown>;
  if (raw.kind !== "normal") throw new Error(`${item.id}.kind must be normal`);
  requireString(raw.display_key, `${item.id}.display_key`);
  requireSafeInteger(raw.slot_cost, `${item.id}.slot_cost`, 1);
  requireStatModifiers(raw, item.id);
  return Object.freeze({ ...item, triggers: requireItemTriggers(raw, item.id) });
}

function requireUniqueItem(value: unknown): CompiledUniqueItem {
  const item = requireIdentified(value, "unique item") as RawUniqueItem;
  const raw = item as Record<string, unknown>;
  if (raw.kind !== "unique") throw new Error(`${item.id}.kind must be unique`);
  requireString(raw.display_key, `${item.id}.display_key`);
  requireSafeInteger(raw.slot_cost, `${item.id}.slot_cost`, 1);
  requireStatModifiers(raw, item.id);
  requireString(raw.visual_transformation_id, `${item.id}.visual_transformation_id`);
  const holderTags = requireArray(raw.suggested_holder_tags, `${item.id}.suggested_holder_tags`);
  if (holderTags.length < 3) throw new Error(`${item.id}.suggested_holder_tags must have at least three tags`);
  holderTags.forEach((tag) => requireString(tag, `${item.id}.suggested_holder_tags[]`));
  return Object.freeze({ ...item, triggers: requireItemTriggers(raw, item.id) });
}

function requireEncounter(value: unknown): RawEncounter {
  const encounter = requireIdentified(value, "encounter") as RawEncounter;
  const raw = encounter as Record<string, unknown>;
  requireSafeInteger(raw.round, `${encounter.id}.round`, 1);
  const biome = requireString(raw.biome, `${encounter.id}.biome`);
  if (!(ENCOUNTER_BIOMES as readonly string[]).includes(biome)) throw new Error(`${encounter.id}.biome is invalid`);
  requireString(raw.kind, `${encounter.id}.kind`);
  requireArray(raw.rewards, `${encounter.id}.rewards`).forEach((reward) => {
    if (!isRecord(reward)) throw new Error(`${encounter.id}.reward must be an object`);
    const kind = requireString(reward.kind, `${encounter.id}.reward.kind`);
    if (![
      "gold", "shop_refresh", "normal_item_choice", "unique_reveal", "hero_choice", "free_reroll", "upgrade_choice", "final_chest",
    ].includes(kind)) throw new Error(`${encounter.id}.reward.kind is invalid`);
    if (kind === "gold" || kind === "free_reroll") requireSafeInteger(reward.amount, `${encounter.id}.reward.${kind}.amount`, 1);
    if (kind === "normal_item_choice" || kind === "hero_choice") requireSafeInteger(reward.options, `${encounter.id}.reward.${kind}.options`, 1);
  });
  const enemyComposition = raw.enemy_composition === undefined ? undefined : requireArray(raw.enemy_composition, `${encounter.id}.enemy_composition`).map((enemy, index) => {
    if (!isRecord(enemy)) throw new Error(`${encounter.id}.enemy_composition[${index}] must be an object`);
    const heroId = requireString(enemy.hero_id, `${encounter.id}.enemy_composition[${index}].hero_id`);
    const position = requireSafeInteger(enemy.position, `${encounter.id}.enemy_composition[${index}].position`, 0);
    if (position > 11) throw new Error(`${encounter.id}.enemy_composition[${index}].position must be <= 11`);
    const statMultiplier = requireSafeInteger(enemy.stat_multiplier, `${encounter.id}.enemy_composition[${index}].stat_multiplier`, 1);
    if (statMultiplier > 5_000) throw new Error(`${encounter.id}.enemy_composition[${index}].stat_multiplier must be <= 5000`);
    return { hero_id: heroId, position, stat_multiplier: statMultiplier } satisfies RawEncounterEnemy;
  });
  if (enemyComposition !== undefined) {
    if (enemyComposition.length === 0) throw new Error(`${encounter.id}.enemy_composition must not be empty`);
    const positions = new Set<number>();
    for (const enemy of enemyComposition) {
      if (positions.has(enemy.position)) throw new Error(`${encounter.id}.enemy_composition has duplicate enemy position ${enemy.position}`);
      positions.add(enemy.position);
    }
  }
  const affix = raw.affix === undefined ? undefined : (() => {
    if (!isRecord(raw.affix)) throw new Error(`${encounter.id}.affix must be an object`);
    if (raw.affix.kind !== "attack_speed_multiplier") throw new Error(`${encounter.id}.affix.kind is invalid`);
    const value = requireSafeInteger(raw.affix.value, `${encounter.id}.affix.value`, 1);
    if (value > 5_000) throw new Error(`${encounter.id}.affix.value must be <= 5000`);
    return { kind: "attack_speed_multiplier", value } satisfies RawEncounterAffix;
  })();
  return { ...encounter, biome: biome as RawEncounter["biome"], ...(enemyComposition === undefined ? {} : { enemy_composition: enemyComposition }), ...(affix === undefined ? {} : { affix }) };
}

function normalizeEffect(value: unknown): CombatEffect {
  const effect = requireIdentified(value, "effect") as RawEffect;
  const raw = effect as Record<string, unknown>;
  return {
    id: effect.id,
    primitive: requireString(raw.primitive, `${effect.id}.primitive`) as CombatEffect["primitive"],
    target: requireString(raw.target, `${effect.id}.target`) as CombatEffect["target"],
    ...(raw.base_value === undefined ? {} : { baseValue: requireSafeInteger(raw.base_value, `${effect.id}.base_value`, 1) }),
    ...(raw.duration_ticks === undefined ? {} : { durationTicks: requireSafeInteger(raw.duration_ticks, `${effect.id}.duration_ticks`, 1) }),
    ...(raw.max_stacks === undefined ? {} : { maxStacks: requireSafeInteger(raw.max_stacks, `${effect.id}.max_stacks`, 1) }),
    ...(raw.interval_ticks === undefined ? {} : { intervalTicks: requireSafeInteger(raw.interval_ticks, `${effect.id}.interval_ticks`, 1) }),
    ...(raw.damage_type === undefined ? {} : { damageType: raw.damage_type as NonNullable<CombatEffect["damageType"]> }),
    ...(raw.stat === undefined ? {} : { stat: raw.stat as NonNullable<CombatEffect["stat"]> }),
    ...(raw.mode === undefined ? {} : { modifierMode: raw.mode as NonNullable<CombatEffect["modifierMode"]> }),
    ...(raw.distance === undefined ? {} : { distance: requireSafeInteger(raw.distance, `${effect.id}.distance`, 1) }),
    ...(raw.summon === undefined ? {} : (() => {
      if (!isRecord(raw.summon)) throw new Error(`${effect.id}.summon must be an object`);
      return {
        summon: Object.freeze({
          id: requireString(raw.summon.id, `${effect.id}.summon.id`),
          maxHp: requireSafeInteger(raw.summon.max_hp, `${effect.id}.summon.max_hp`, 1),
          durationTicks: requireSafeInteger(raw.summon.duration_ticks, `${effect.id}.summon.duration_ticks`, 1),
        }),
      };
    })()),
    ...(raw.scales_with_skill_power === undefined ? {} : { scalesWithSkillPower: raw.scales_with_skill_power === true }),
    ...(raw.scales_with_max_hp === undefined ? {} : { scalesWithMaxHp: raw.scales_with_max_hp === true }),
    ...(raw.scales_with_attack_damage === undefined ? {} : { scalesWithAttackDamage: raw.scales_with_attack_damage === true }),
    ...(raw.scales_with_target_max_hp === undefined ? {} : { scalesWithTargetMaxHp: raw.scales_with_target_max_hp === true }),
    ...(raw.only_when_engaged === undefined ? {} : { onlyWhenEngaged: raw.only_when_engaged === true }),
    ...(raw.remove_on_move === undefined ? {} : { removeOnMove: raw.remove_on_move === true }),
    ...(raw.cleanseable === undefined ? {} : { cleanseable: raw.cleanseable === true }),
  };
}

function stableSerialize(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "number" || typeof value === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (!isRecord(value)) throw new Error("Content contains an unsupported value");
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`).join(",")}}`;
}

function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

function toReadonlyMap<T extends RawIdentifiedContent>(values: readonly T[]): ReadonlyMap<string, T> {
  return new Map(values.map((value) => [value.id, Object.freeze({ ...value })]));
}

function toReadonlyValues<T extends RawIdentifiedContent>(values: readonly T[]): readonly T[] {
  return Object.freeze(values.map((value) => Object.freeze({ ...value })));
}

function validateAlphaV03Cardinality(input: {
  readonly version: string;
  readonly heroes: readonly RawHero[];
  readonly traits: readonly RawIdentifiedContent[];
  readonly normalItems: readonly RawIdentifiedContent[];
  readonly uniqueItems: readonly RawUniqueItem[];
  readonly transformations: readonly RawIdentifiedContent[];
  readonly encounters: readonly RawEncounter[];
}): void {
  if (input.version !== "alpha-0.3.0") return;
  const speciesTraits = input.traits.filter((trait) => (trait as Record<string, unknown>).kind === "species").length;
  const classTraits = input.traits.filter((trait) => (trait as Record<string, unknown>).kind === "class").length;
  const shopHeroes = input.heroes.filter((hero) => !hero.is_unique_hero).length;
  const uniqueHeroes = input.heroes.filter((hero) => hero.is_unique_hero).length;
  const uniqueRevealCount = input.encounters.flatMap((encounter) => encounter.rewards).filter((reward) => reward.kind === "unique_reveal").length;
  const validRounds = input.encounters.length === 8 && input.encounters.every((encounter) => encounter.round >= 1 && encounter.round <= 8);
  if (
    input.heroes.length !== 24 || shopHeroes !== 21 || uniqueHeroes !== 3 || speciesTraits !== 6 || classTraits !== 6 || input.normalItems.length !== 12 ||
    input.uniqueItems.length !== 6 || input.transformations.length !== 6 || !validRounds || uniqueRevealCount !== 1
  ) throw new Error("Alpha v0.3 content requires 24 heroes (21 shop and 3 Unique), 6 species traits, 6 class traits, 12 normal items, 6 Unique items, 6 transformations, 8 encounters, and one unique_reveal");
}

export function compileContentBundle(raw: unknown): CompiledContentBundle {
  if (!isRecord(raw)) throw new Error("Content bundle must be an object");
  requireSafeIntegerNumbers(raw, "content");
  const version = requireString(raw.version, "version");
  const heroes = requireArray(raw.heroes, "heroes").map(requireHero);
  const skills = requireArray(raw.skills, "skills").map(requireSkill);
  const traits = requireArray(raw.traits, "traits").map(requireTrait);
  const visualProfiles = requireArray(raw.visual_profiles, "visual_profiles").map(requireVisualProfile);
  const normalItems = requireArray(raw.normal_items, "normal_items").map(requireNormalItem);
  const uniqueItems = requireArray(raw.unique_items, "unique_items").map(requireUniqueItem);
  const transformations = requireArray(raw.transformations, "transformations").map((value) => requireIdentified(value, "transformation"));
  const encounters = requireArray(raw.encounters, "encounters").map(requireEncounter);
  requireUniqueIds(heroes, "hero"); requireUniqueIds(skills, "skill"); requireUniqueIds(traits, "trait"); requireUniqueIds(visualProfiles, "visual profile");
  requireUniqueIds(normalItems, "normal item"); requireUniqueIds(uniqueItems, "unique item"); requireUniqueIds(transformations, "transformation"); requireUniqueIds(encounters, "encounter");
  const skillIds = new Set(skills.map((skill) => skill.id));
  const traitIds = new Set(traits.map((trait) => trait.id));
  const profileIds = new Set(visualProfiles.map((profile) => profile.id));
  const transformationIds = new Set(transformations.map((transformation) => transformation.id));
  const encounterRounds = new Set<number>();
  const heroIds = new Set(heroes.map((hero) => hero.id));
  for (const hero of heroes) {
    if (!skillIds.has(hero.skill_id)) throw new Error(`${hero.id} references missing skill ${hero.skill_id}`);
    if (!traitIds.has(hero.species_trait_id)) throw new Error(`${hero.id} references missing species trait ${hero.species_trait_id}`);
    if (!traitIds.has(hero.class_trait_id)) throw new Error(`${hero.id} references missing class trait ${hero.class_trait_id}`);
    if (!profileIds.has(hero.visual_profile_id)) throw new Error(`${hero.id} references missing visual profile ${hero.visual_profile_id}`);
  }
  for (const item of uniqueItems) {
    const transformationId = (item as Record<string, unknown>).visual_transformation_id as string;
    if (!transformationIds.has(transformationId)) throw new Error(`${item.id} references missing transformation ${transformationId}`);
  }
  for (const encounter of encounters) {
    const round = encounter.round;
    if (encounterRounds.has(round)) throw new Error(`Duplicate encounter round: ${round}`);
    encounterRounds.add(round);
    const rewards = encounter.rewards;
    if (round !== 4 && rewards.some((reward) => reward.kind === "unique_reveal")) {
      throw new Error(`unique_reveal is only valid on round 4 (found on round ${round})`);
    }
    for (const enemy of encounter.enemy_composition ?? []) {
      if (!heroIds.has(enemy.hero_id)) throw new Error(`${encounter.id}.enemy_composition references missing hero ${enemy.hero_id}`);
    }
  }
  validateAlphaV03Cardinality({ version, heroes, traits, normalItems, uniqueItems, transformations, encounters });
  const canonical: RawContentBundle = { version, heroes, skills, traits, visual_profiles: visualProfiles, normal_items: normalItems, unique_items: uniqueItems, transformations, encounters };
  return Object.freeze({
    version,
    contentHash: fnv1a64Hex(stableSerialize(canonical)),
    manifest: Object.freeze({
      heroCount: heroes.length,
      shopHeroCount: heroes.filter((hero) => !hero.is_unique_hero).length,
      uniqueHeroCount: heroes.filter((hero) => hero.is_unique_hero).length,
      skillCount: skills.length,
      traitCount: traits.length,
      normalItemCount: normalItems.length,
      uniqueItemCount: uniqueItems.length,
      transformationCount: transformations.length,
      encounterCount: encounters.length,
    }),
    heroesById: toReadonlyMap(heroes),
    skillsById: toReadonlyMap(skills),
    traitsById: toReadonlyMap(traits),
    visualProfilesById: toReadonlyMap(visualProfiles),
    normalItems: toReadonlyValues(normalItems),
    uniqueItems: toReadonlyValues(uniqueItems),
    transformations: toReadonlyValues(transformations),
    encounters: toReadonlyValues(encounters),
  });
}
