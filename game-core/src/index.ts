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
export {
  assertContentRulesetCompatibility,
  inspectContentRulesetCompatibility,
  type CompatibilityIssue,
  type ContentRulesetCompatibility,
} from "./compatibility/content-ruleset.js";
export {
  assertOfflineReleaseCompatibility,
  compileOfflineRelease,
  type AssetRevisionRef,
  type CompiledOfflineRelease,
  type ReleaseCompatibilityInput,
  type VersionedArtifactRef,
} from "./compatibility/release.js";
export {
  assertAdventureRoster,
  createEmptyAdventureRoster,
  deployedHeroCount,
  freezeAdventureRoster,
  locateAdventureHero,
  mergeAdventureRoster,
  moveAdventureHero,
} from "./adventure/roster.js";
export type {
  AdventureHeroInstance,
  AdventureItemInstance,
  AdventureItemKind,
  AdventurePhase,
  AdventureRoster,
  AdventureRunState,
  AdventureShopSlot,
  HeroStars,
  LocatedHero,
  RosterDestination,
  RosterLocationKind,
} from "./adventure/types.js";
export { compileRuleset } from "./rules/compiler.js";
export {
  assertGlobalPosition,
  boardCellCount,
  boardColumn,
  boardRow,
  enemyBoardCellCount,
  globalBoardIndex,
  globalPlayerIndexToLocal,
  isEnemyPosition,
  isPlayerPosition,
  isValidGlobalPosition,
  localPlayerIndexToGlobal,
  manhattanDistance,
  orthogonalNeighbors,
  playerBoardCellCount,
} from "./rules/board.js";
export {
  adventureRoundIncome,
  standardRoundIncome,
  standardStreakBonus,
  type IncomeBreakdown,
} from "./rules/economy.js";
export {
  buyExperience,
  canBuyExperience,
  initialProgressionState,
  progressionState,
  shopOddsAtLevel,
  type ProgressionState,
} from "./rules/progression.js";
export type {
  AdventureRules,
  BoardRules,
  CombatRules,
  CompiledRuleset,
  HeroRarity,
  ProgressionLevelRule,
  ProgressionRules,
  RosterRules,
  RuleRowRange,
  ShopOdds,
  ShopRules,
  StandardRules,
  StreakBonusRule,
} from "./rules/types.js";
