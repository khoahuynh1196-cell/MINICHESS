export {
  SCALE,
  canonicalizeSnapshot,
  findPathToRange,
  resolveDamage,
  runHeadlessCombat,
  selectNearestTarget,
  type CombatEvent,
  type CombatImmunity,
  type CombatResult,
  type CombatSkill,
  type CombatSnapshot,
  type CombatUnit,
  type CombatPassive,
  type TargetingUnit,
} from "./simulation/kernel.js";
export {
  BOARD_CELL_COUNT,
  BOARD_COLUMNS,
  BOARD_ROWS,
  PLAYER_FORMATION_SIZE,
  PLAYER_GLOBAL_START,
  isEnemyPosition,
  isPlayerPosition,
} from "./simulation/board.js";
export { createSeededRng, type SeededRng } from "./simulation/seeded-rng.js";
export {
  validateEffectDefinition,
  type CombatEffect,
  type CombatStat,
  type DamageType,
  type EffectPrimitive,
  type EffectTarget,
  type SummonDefinition,
} from "./effects/definitions.js";
export { compileContentBundle } from "./content/compiler.js";
export type { CompiledCombatTrigger, CompiledContentBundle, CompiledItem, CompiledUniqueItem, ContentManifest, RawContentBundle, RawEncounter, RawEncounterReward, RawUniqueItem } from "./content/types.js";
