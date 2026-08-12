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
export {
  CANONICAL_ASSET_MANIFEST_VERSION,
  CANONICAL_CONTENT_VERSION,
  CANONICAL_RULESET_VERSION,
  loadCanonicalBoardContract,
  type BoardContract,
} from "./rules/board-contract.js";
export {
  migrateLegacyBoard4x8,
  migrateLegacyPosition4x8,
  type BoardMigrationResult,
  type LegacyCell,
  type PositionMigrationResult,
} from "./compatibility/legacy-board-migration.js";
export { readVersionedRunState, type VersionedStateResult } from "./compatibility/versioned-state.js";
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
