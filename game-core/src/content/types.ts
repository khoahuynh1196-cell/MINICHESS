export interface RawContentBundle {
  readonly version: string;
  readonly heroes: readonly RawHero[];
  readonly skills: readonly RawSkill[];
  readonly traits: readonly RawIdentifiedContent[];
  readonly visual_profiles: readonly RawVisualProfile[];
  readonly normal_items: readonly RawIdentifiedContent[];
  readonly unique_items: readonly RawIdentifiedContent[];
  readonly transformations: readonly RawIdentifiedContent[];
  readonly encounters: readonly RawEncounter[];
}

export interface RawIdentifiedContent {
  readonly id: string;
  readonly [key: string]: unknown;
}

export interface RawHero extends RawIdentifiedContent {
  readonly species_trait_id: string;
  readonly class_trait_id: string;
  readonly cost: number;
  readonly rarity: HeroRarity;
  readonly tags: readonly string[];
  readonly is_unique_hero: boolean;
  readonly base_stats: Readonly<Record<string, number>>;
  readonly star_multipliers: Readonly<Record<string, Readonly<Record<string, number>>>>;
  readonly skill_id: string;
  readonly visual_profile_id: string;
}

export type HeroRarity = 1 | 2 | 3 | 4 | 5;

export interface RawSkill extends RawIdentifiedContent {
  readonly cast_time_ticks: number;
  readonly effects: readonly RawEffect[];
}

export interface RawEffect extends RawIdentifiedContent {
  readonly primitive: string;
  readonly target: string;
  readonly [key: string]: unknown;
}

export interface RawVisualProfile extends RawIdentifiedContent {
  readonly sprite_key: string;
  readonly portrait_key: string;
  readonly ability_icon_key: string;
  readonly vfx_key: string;
  readonly anchors: readonly string[];
  readonly animations: readonly string[];
}

export interface RawUniqueItem extends RawIdentifiedContent {
  readonly visual_transformation_id: string;
  readonly suggested_holder_tags: readonly string[];
}

export type CombatTriggerKind =
  | "on_combat_start"
  | "on_basic_attack"
  | "on_cast_resolve"
  | "on_hp_below"
  | "on_every_nth_basic_attack"
  | "on_damage_dealt"
  | "on_critical_basic_attack"
  | "on_heal_or_shield"
  | "on_death"
  | "on_kill"
  | "on_stationary_interval";

export interface CompiledCombatTrigger {
  readonly id: string;
  readonly trigger: CombatTriggerKind;
  readonly effects: readonly CombatEffect[];
  readonly cooldownTicks?: number;
  readonly thresholdPercent?: number;
  readonly attackCount?: number;
  readonly stationaryIntervalTicks?: number;
  readonly holderHeroIds?: readonly string[];
  readonly oncePerCombat?: boolean;
  readonly oncePerOwnerPerCombat?: boolean;
  readonly basicOnly?: boolean;
  readonly lifestealPerThousand?: number;
}

export interface CompiledItem extends RawIdentifiedContent {
  readonly triggers: readonly CompiledCombatTrigger[];
}

export interface CompiledUniqueItem extends RawUniqueItem {
  readonly triggers: readonly CompiledCombatTrigger[];
}

export interface RawEncounterReward {
  readonly kind: string;
  readonly [key: string]: unknown;
}

export interface RawEncounterEnemy {
  readonly hero_id: string;
  readonly position: number;
  readonly stat_multiplier: number;
}

export interface RawEncounterAffix {
  readonly kind: "attack_speed_multiplier";
  readonly value: number;
}

export interface RawEncounter extends RawIdentifiedContent {
  readonly round: number;
  readonly biome: EncounterBiome;
  readonly kind: string;
  readonly rewards: readonly RawEncounterReward[];
  readonly enemy_composition?: readonly RawEncounterEnemy[];
  readonly affix?: RawEncounterAffix;
}

export const ENCOUNTER_BIOMES = ["meadow", "ruins", "frost_keep", "ember_citadel"] as const;
export type EncounterBiome = (typeof ENCOUNTER_BIOMES)[number];

export interface ContentManifest {
  readonly heroCount: number;
  readonly shopHeroCount: number;
  readonly uniqueHeroCount: number;
  readonly skillCount: number;
  readonly traitCount: number;
  readonly normalItemCount: number;
  readonly uniqueItemCount: number;
  readonly transformationCount: number;
  readonly encounterCount: number;
}

export interface CompiledContentBundle {
  readonly version: string;
  readonly contentHash: string;
  readonly manifest: ContentManifest;
  readonly heroesById: ReadonlyMap<string, RawHero>;
  readonly skillsById: ReadonlyMap<string, RawSkill>;
  readonly traitsById: ReadonlyMap<string, RawIdentifiedContent>;
  readonly visualProfilesById: ReadonlyMap<string, RawVisualProfile>;
  readonly normalItems: readonly CompiledItem[];
  readonly uniqueItems: readonly CompiledUniqueItem[];
  readonly transformations: readonly RawIdentifiedContent[];
  readonly encounters: readonly RawEncounter[];
}
import type { CombatEffect } from "../effects/definitions.js";
