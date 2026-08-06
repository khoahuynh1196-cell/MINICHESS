import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import { progressionState } from "../rules/progression.js";
import { grantAdventureItem } from "./items.js";
import {
  buildAdventureRewardPlan,
  validateAdventureRewardSelections,
  type AdventureRewardSelection,
} from "./rewards.js";
import { mergeAdventureRoster } from "./roster.js";
import {
  commitAdventureMutation,
  replayAdventureMutation,
  type AdventureCombatSummary,
  type AdventureGameState,
  type AdventureMutationBase,
  type AdventureMutationResult,
} from "./state.js";
import { reserveAdventureHeroCopies } from "./shop.js";
import type { AdventureHeroInstance, AdventureRoster, AdventureRunState } from "./types.js";

export interface AdventureCombatResolutionCommand extends AdventureMutationBase {
  readonly type: "RESOLVE_COMBAT";
}

export interface AdventureCombatOutcome {
  readonly round: number;
  readonly winner: "player" | "enemy";
  readonly survivingEnemyUnits: number;
  readonly resultHash: string;
  readonly finalTick: number;
  readonly reason: "elimination" | "timeout";
}

export interface AdventureRewardClaimCommand extends AdventureMutationBase {
  readonly type: "CLAIM_ROUND_REWARD";
  readonly selections: readonly AdventureRewardSelection[];
}

function requireCombatOutcome(outcome: AdventureCombatOutcome, rules: CompiledRuleset): void {
  if (!Number.isSafeInteger(outcome.round) || outcome.round < 1 || outcome.round > rules.adventure.roundCount) {
    throw new Error("ADVENTURE_COMBAT_ROUND_INVALID");
  }
  if (!Number.isSafeInteger(outcome.survivingEnemyUnits) || outcome.survivingEnemyUnits < 0) {
    throw new Error("ADVENTURE_SURVIVOR_COUNT_INVALID");
  }
  if (outcome.resultHash.trim().length === 0) throw new Error("ADVENTURE_RESULT_HASH_MISSING");
  if (!Number.isSafeInteger(outcome.finalTick) || outcome.finalTick < 0 || outcome.finalTick > rules.combat.maxTicks) {
    throw new Error("ADVENTURE_FINAL_TICK_INVALID");
  }
}

function assertVersions(state: AdventureGameState, rules: CompiledRuleset, content: CompiledContentBundle): void {
  if (state.run.rulesetVersion !== rules.version) throw new Error("ADVENTURE_RULESET_MISMATCH");
  if (state.run.contentVersion !== content.version) throw new Error("ADVENTURE_CONTENT_MISMATCH");
}

function combatSummary(outcome: AdventureCombatOutcome): AdventureCombatSummary {
  return Object.freeze({ ...outcome });
}

export function recordAdventureCombatResult(
  state: AdventureGameState,
  command: AdventureCombatResolutionCommand,
  outcome: AdventureCombatOutcome,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): AdventureMutationResult {
  const replay = replayAdventureMutation(state, command);
  if (replay !== undefined) return replay;
  assertVersions(state, rules, content);
  requireCombatOutcome(outcome, rules);
  if (state.run.phase !== "COMBAT") throw new Error("ADVENTURE_COMMAND_NOT_ALLOWED");
  if (state.run.round !== outcome.round) throw new Error("ADVENTURE_COMBAT_ROUND_MISMATCH");

  const loss = outcome.winner === "enemy"
    ? Math.min(
      rules.adventure.lossDamage.cap,
      rules.adventure.lossDamage.base + rules.adventure.lossDamage.perSurvivor * outcome.survivingEnemyUnits,
    )
    : 0;
  const health = Math.max(0, state.run.health - loss);
  const lastCombat = combatSummary(outcome);
  const pendingReward = health === 0
    ? undefined
    : buildAdventureRewardPlan({ seed: state.seed, round: state.run.round, content });
  const run: AdventureRunState = {
    ...state.run,
    health,
    phase: health === 0 ? "COMPLETE" : "REWARD",
  };

  return commitAdventureMutation(state, command, {
    seed: state.seed,
    run,
    shopPool: state.shopPool,
    refreshNumber: state.refreshNumber,
    acquisitionCounter: state.acquisitionCounter,
    ...(pendingReward === undefined ? {} : { pendingReward }),
    lastCombat,
  });
}

function rosterFromRun(run: AdventureRunState): AdventureRoster {
  return { board: run.board, bench: run.bench, items: run.items };
}

function withRoster(run: AdventureRunState, roster: AdventureRoster): AdventureRunState {
  return { ...run, board: roster.board, bench: roster.bench, items: roster.items };
}

function rewardInstanceId(runId: string, round: number, offerId: string, optionId: string): string {
  return `reward:${runId}:${round}:${offerId}:${optionId}`;
}

export function claimAdventureRoundReward(
  state: AdventureGameState,
  command: AdventureRewardClaimCommand,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): AdventureMutationResult {
  const replay = replayAdventureMutation(state, command);
  if (replay !== undefined) return replay;
  assertVersions(state, rules, content);
  if (state.run.phase !== "REWARD" || state.pendingReward === undefined || state.lastCombat === undefined) {
    throw new Error("ADVENTURE_COMMAND_NOT_ALLOWED");
  }
  if (state.pendingReward.round !== state.run.round || state.lastCombat.round !== state.run.round) {
    throw new Error("ADVENTURE_REWARD_ROUND_MISMATCH");
  }

  validateAdventureRewardSelections(state.pendingReward, command.selections);
  const progression = progressionState(rules, state.run.level, state.run.experience);
  let roster = rosterFromRun(state.run);
  let shopPool = state.shopPool;
  let acquisitionCounter = state.acquisitionCounter;
  const rewardHeroes: AdventureHeroInstance[] = [...state.run.rewardHeroes];

  for (const selection of command.selections) {
    const offer = state.pendingReward.offers.find((candidate) => candidate.id === selection.offerId)!;
    const option = offer.options.find((candidate) => candidate.id === selection.optionId)!;
    const instanceId = rewardInstanceId(state.run.id, state.run.round, offer.id, option.id);
    if (option.kind === "normal_item" || option.kind === "unique") {
      roster = grantAdventureItem(rules, roster, progression.boardCap, {
        instanceId,
        itemId: option.id,
        kind: option.kind === "unique" ? "unique" : "normal",
      });
      continue;
    }

    const hero = content.heroesById.get(option.id);
    if (hero === undefined || hero.is_unique_hero) throw new Error(`ADVENTURE_REWARD_HERO_INVALID:${option.id}`);
    if (option.cost === undefined || option.cost !== hero.cost) throw new Error(`ADVENTURE_REWARD_HERO_COST_INVALID:${option.id}`);
    shopPool = reserveAdventureHeroCopies(shopPool, hero.id, 1);
    acquisitionCounter += 1;
    rewardHeroes.push(Object.freeze({
      instanceId,
      heroId: hero.id,
      cost: hero.cost,
      stars: 1,
      poolCopies: 1,
      acquisitionOrder: acquisitionCounter,
    }));
  }

  roster = mergeAdventureRoster(rules, roster, progression.boardCap);
  const finalRound = state.run.round === rules.adventure.roundCount;
  const run = withRoster({
    ...state.run,
    phase: finalRound ? "COMPLETE" : "PREPARE",
    round: finalRound ? state.run.round : state.run.round + 1,
    gold: state.run.gold + rules.adventure.baseRoundIncome + state.pendingReward.supplementalGold,
    freeRefreshes: state.run.freeRefreshes + state.pendingReward.freeRefreshes,
    rewardHeroes: Object.freeze(rewardHeroes),
  }, roster);

  return commitAdventureMutation(state, command, {
    seed: state.seed,
    run,
    shopPool,
    refreshNumber: state.refreshNumber,
    acquisitionCounter,
    lastCombat: state.lastCombat,
  });
}
