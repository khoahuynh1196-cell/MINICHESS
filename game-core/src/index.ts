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
  LEGACY_ALPHA_GEOMETRY,
  PRODUCTION_4X8_GEOMETRY,
  geometryFromRules,
  type CombatDirection,
  type CombatGeometry,
} from "./simulation/geometry.js";
export { runProductionCombat } from "./simulation/production-kernel.js";
export {
  validateEffectDefinition,
  type CombatEffect,
  type CombatStat,
  type DamageType,
  type EffectPrimitive,
  type EffectTarget,
  type SummonDefinition,
} from "./effects/definitions.js";
export { compileCombatEffect, compileContentBundle } from "./content/compiler.js";
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
export { sha256Hex, stableStringify } from "./serialization/canonical-json.js";
export {
  resolveAdventureCombat,
  type AdventureCombatEngine,
  type AdventureCombatEngineRequest,
  type AdventureCombatEngineResult,
  type AdventureCombatResolutionResult,
} from "./adventure/engine.js";
export {
  equipAdventureItem,
  grantAdventureItem,
  unequipAdventureItem,
} from "./adventure/items.js";
export {
  ackAdventurePlaybackComplete,
  claimAdventureRoundReward,
  recordAdventureCombatResult,
  type AdventureCombatOutcome,
  type AdventureCombatResolutionCommand,
  type AdventureCombatResultCommand,
  type AdventurePlaybackAckCommand,
  type AdventureRewardClaimCommand,
} from "./adventure/lifecycle.js";
export {
  assertAdventureCombatPlayback,
  createAdventureCombatPlayback,
  validateAdventurePlaybackEvents,
  type AdventureCombatPlayback,
  type AdventurePlaybackEvent,
  type AdventurePlaybackEventType,
} from "./adventure/playback.js";
export {
  handleAdventureRuntimeRequest,
  parseAdventureRuntimeRequest,
  type AdventureRuntimeRequest,
  type AdventureRuntimeResponse,
} from "./adventure/protocol.js";
export {
  buildAdventureCombatSnapshot,
  type AdventureCombatBoardContract,
  type AdventureCombatEnemyRef,
  type AdventureCombatHeroRef,
  type AdventureCombatSnapshot,
} from "./adventure/snapshot.js";
export {
  buildAdventureView,
  type AdventureActionAvailability,
  type AdventureActions,
  type AdventureTraitView,
  type AdventureView,
} from "./adventure/view.js";
export {
  applyAdventureCommand,
  createAdventureGame,
  type AdventureCommand,
  type AdventureCommandBase,
  type AdventureCommandReceipt,
  type AdventureCommandResult,
  type AdventureGameState,
  type CreateAdventureGameInput,
} from "./adventure/reducer.js";
export {
  buildAdventureRewardPlan,
  validateAdventureRewardSelections,
  type AdventureRewardOffer,
  type AdventureRewardOfferKind,
  type AdventureRewardOption,
  type AdventureRewardOptionKind,
  type AdventureRewardPlan,
  type AdventureRewardSelection,
  type BuildAdventureRewardPlanInput,
} from "./adventure/rewards.js";
export {
  assertAdventureRoster,
  createEmptyAdventureRoster,
  deployedHeroCount,
  freezeAdventureRoster,
  locateAdventureHero,
  mergeAdventureRoster,
  moveAdventureHero,
} from "./adventure/roster.js";
export {
  ADVENTURE_SAVE_SCHEMA,
  decodeAdventureSave,
  encodeAdventureSave,
  type AdventureSaveContext,
  type AdventureSaveEnvelope,
  type AdventureSavePayload,
} from "./adventure/save.js";
export {
  AdventureSession,
  type AdventureSessionDependencies,
  type AdventureStateStore,
  type CreateAdventureSessionInput,
} from "./adventure/session.js";
export {
  sellAdventureHero,
  type SellAdventureHeroResult,
} from "./adventure/sell.js";
export {
  adventureShopRemainingCopies,
  buyAdventureShopSlot,
  createAdventureShopPool,
  refreshAdventureShop,
  reserveAdventureHeroCopies,
  returnAdventureHeroCopies,
  returnAdventureShopSlots,
  rollAdventureShop,
  type AdventureShopPool,
  type AdventureShopPoolEntry,
  type AdventureShopRoll,
} from "./adventure/shop.js";
export {
  commitAdventureMutation,
  freezeAdventureGameState,
  replayAdventureMutation,
  type AdventureCombatSummary,
  type AdventureMutationBase,
  type AdventureMutationResult,
} from "./adventure/state.js";
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
export { assertAdventureGameState } from "./adventure/validation.js";
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
  AdventureLossDamageRules,
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
