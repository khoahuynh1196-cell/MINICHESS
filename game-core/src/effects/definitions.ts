export type EffectPrimitive =
  | "deal_damage"
  | "restore_mana"
  | "damage_reduction"
  | "heal"
  | "shield"
  | "stun"
  | "slow"
  | "buff_stat"
  | "debuff_stat"
  | "dash"
  | "retreat"
  | "knockback"
  | "summon"
  | "apply_dot"
  | "cleanse";

export type EffectTarget =
  | "self"
  | "locked_target"
  | "nearest_other_enemy"
  | "lowest_hp_ally"
  | "adjacent_allies"
  | "rear_ally"
  | "nearest_trait_ally"
  | "adjacent_trait_allies"
  | "all_trait_allies"
  | "adjacent_enemies"
  | "all_enemies";

export type DamageType = "physical" | "magic" | "true";

export type CombatStat =
  | "max_hp"
  | "attack_damage"
  | "attack_speed"
  | "armor"
  | "magic_resist"
  | "move_speed"
  | "starting_mana"
  | "max_mana"
  | "crit_chance"
  | "crit_multiplier"
  | "skill_power";

export interface SummonDefinition {
  readonly id: string;
  readonly maxHp: number;
  readonly durationTicks: number;
}

export interface CombatEffect {
  readonly id: string;
  readonly primitive: EffectPrimitive;
  readonly target: EffectTarget;
  readonly baseValue?: number;
  readonly durationTicks?: number;
  readonly maxStacks?: number;
  readonly intervalTicks?: number;
  readonly damageType?: DamageType;
  readonly stat?: CombatStat;
  readonly modifierMode?: "flat" | "percent";
  readonly distance?: number;
  readonly summon?: SummonDefinition;
  readonly scalesWithSkillPower?: boolean;
  readonly scalesWithMaxHp?: boolean;
  readonly scalesWithAttackDamage?: boolean;
  readonly scalesWithTargetMaxHp?: boolean;
  readonly oncePerCombat?: boolean;
  readonly onlyWhenEngaged?: boolean;
  readonly removeOnMove?: boolean;
  readonly cleanseable?: boolean;
}

const DAMAGE_TYPES: readonly DamageType[] = ["physical", "magic", "true"];
const STATS: readonly CombatStat[] = [
  "max_hp",
  "attack_damage",
  "attack_speed",
  "armor",
  "magic_resist",
  "move_speed",
  "starting_mana",
  "max_mana",
  "crit_chance",
  "crit_multiplier",
  "skill_power",
];

function assertIdentifier(value: string, label: string): void {
  if (value.length === 0) {
    throw new Error(`${label} must not be empty`);
  }
}

function assertPositiveInteger(value: number | undefined, label: string): void {
  if (value === undefined || !Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
}

function assertBaseValue(effect: CombatEffect): void {
  assertPositiveInteger(effect.baseValue, `baseValue for ${effect.id}`);
}

function assertDuration(effect: CombatEffect): void {
  assertPositiveInteger(effect.durationTicks, `durationTicks for ${effect.id}`);
}

export function validateEffectDefinition(effect: CombatEffect): void {
  assertIdentifier(effect.id, "Effect ID");

  switch (effect.primitive) {
    case "deal_damage":
      assertBaseValue(effect);
      if (effect.damageType === undefined || !DAMAGE_TYPES.includes(effect.damageType)) {
        throw new Error(`damageType is required for ${effect.id}`);
      }
      return;
    case "restore_mana":
      assertBaseValue(effect);
      return;
    case "damage_reduction":
      assertBaseValue(effect);
      assertDuration(effect);
      if (effect.maxStacks !== undefined) assertPositiveInteger(effect.maxStacks, `maxStacks for ${effect.id}`);
      return;
    case "heal":
      assertBaseValue(effect);
      return;
    case "shield":
      assertBaseValue(effect);
      assertDuration(effect);
      return;
    case "stun":
      assertDuration(effect);
      return;
    case "slow":
      assertBaseValue(effect);
      assertDuration(effect);
      return;
    case "buff_stat":
    case "debuff_stat":
      assertBaseValue(effect);
      assertDuration(effect);
      if (effect.maxStacks !== undefined) assertPositiveInteger(effect.maxStacks, `maxStacks for ${effect.id}`);
      if (effect.stat === undefined || !STATS.includes(effect.stat)) {
        throw new Error(`stat is required for ${effect.id}`);
      }
      if (effect.modifierMode !== "flat" && effect.modifierMode !== "percent") {
        throw new Error(`modifierMode is required for ${effect.id}`);
      }
      return;
    case "dash":
    case "retreat":
    case "knockback":
      assertPositiveInteger(effect.distance, `distance for ${effect.id}`);
      return;
    case "summon":
      if (effect.summon === undefined) {
        throw new Error(`summon is required for ${effect.id}`);
      }
      assertIdentifier(effect.summon.id, `summon ID for ${effect.id}`);
      assertPositiveInteger(effect.summon.maxHp, `summon maxHp for ${effect.id}`);
      assertPositiveInteger(effect.summon.durationTicks, `summon durationTicks for ${effect.id}`);
      return;
    case "apply_dot":
      assertBaseValue(effect);
      assertDuration(effect);
      assertPositiveInteger(effect.intervalTicks, `intervalTicks for ${effect.id}`);
      if (effect.damageType === undefined || !DAMAGE_TYPES.includes(effect.damageType)) {
        throw new Error(`damageType is required for ${effect.id}`);
      }
      return;
    case "cleanse":
      return;
  }
}
