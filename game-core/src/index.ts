export {
  SCALE,
  canonicalizeSnapshot,
  hashCombatSnapshot,
  resolveDamage,
  runHeadlessCombat,
  type CombatEvent,
  type CombatImmunity,
  type CombatResult,
  type CombatSkill,
  type CombatSnapshot,
  type CombatUnit,
  type CombatPassive,
} from "./simulation/kernel.js";
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
export { compileRuleset } from "./rules/compiler.js";
export type { BoardGeometry, CompiledRuleset, ProgressionLevelRule, RuleRowRange, RulesetRarity, ShopOddsTuple } from "./rules/types.js";

export {
  assertBoardGeometry,
  assertBoardPosition,
  boardCellCount,
  findPathToRange,
  manhattanDistance,
  playerBoardCellCount,
  playerStartCell,
  selectNearestTarget,
  sortedNeighbors,
  type BoardSide,
  type TargetingUnit,
} from "./rules/board.js";
