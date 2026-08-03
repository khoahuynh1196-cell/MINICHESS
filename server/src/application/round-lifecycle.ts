import type { CombatResult, CompiledContentBundle } from "@auto-battler/game-core";
import type { CombatRecord, HeroInstance, ItemInstance, RunRecord } from "./run-commands.js";
import { buildRoundRewardPlan, type RewardSelection } from "./reward-selection.js";
import { cloneShopPool, reserveHeroFromShopPool } from "./shop-pool.js";

const BASE_WIN_GOLD = 5;

export function recordResolvedCombat(run: RunRecord, result: CombatResult): RunRecord {
  if (run.state !== "COMBAT" || run.lockedSnapshot === undefined) throw new Error("COMMAND_NOT_ALLOWED");
  const combatRecord: CombatRecord = Object.freeze({
    round: run.lockedSnapshot.round,
    winner: result.winner,
    resultHash: result.resultHash,
    finalTick: result.finalTick,
    reason: result.reason,
    events: Object.freeze([...result.events]),
  });
  const lossDamage = result.winner === "enemy"
    ? Math.min(12, 4 + 2 * result.units.filter((unit) => unit.side === "enemy" && !unit.isSummon && unit.currentHp > 0).length)
    : 0;
  const health = Math.max(0, (run.health ?? 30) - lossDamage);
  const shouldRevealUnique = run.lockedSnapshot.round === 4 && health > 0 && run.preselectedUniqueId !== undefined && run.uniqueRevealed !== true;
  if (shouldRevealUnique && (run.items ?? []).some((item) => item.kind === "unique")) throw new Error("GAME_RULE_VIOLATION");
  const items = shouldRevealUnique
    ? [...(run.items ?? []), { instanceId: `unique:${run.id}:${run.preselectedUniqueId!}`, itemId: run.preselectedUniqueId!, kind: "unique" as const }]
    : run.items;
  return Object.freeze({
    ...run,
    health,
    state: health === 0 ? "COMPLETE" : "REWARD",
    revision: run.revision + 1,
    combatRecord,
    ...(items === undefined ? {} : { items }),
    ...(shouldRevealUnique ? { uniqueRevealed: true } : {}),
  });
}

/** Binds immutable, seed-derived content rewards to the completed round. */
export function attachContentRoundRewards(run: RunRecord, content: CompiledContentBundle): RunRecord {
  if (run.state !== "REWARD" || run.combatRecord === undefined || run.runSeed === undefined) return run;
  if (run.roundRewardPlan?.round === run.combatRecord.round) return run;
  const roundRewardPlan = buildRoundRewardPlan({ runSeed: run.runSeed, round: run.combatRecord.round, content });
  return Object.freeze({ ...run, roundRewardPlan });
}

/**
 * Applies the mandatory +5 gold victory award after a resolved PvE combat.
 * Keeping the claimed round on the run makes a retry after a successful
 * persistence write a no-op instead of duplicating currency.
 */
function materializeRewardSelections(run: RunRecord, selections: readonly RewardSelection[]): Pick<RunRecord, "items" | "rewardHeroes" | "shopPool"> {
  const plan = run.roundRewardPlan;
  if (plan === undefined || plan.offers.length === 0) {
    if (selections.length !== 0) throw new Error("REWARD_SELECTION_INVALID");
    return {};
  }
  const byOfferId = new Map(plan.offers.map((offer) => [offer.id, offer]));
  if (selections.length !== plan.offers.length || new Set(selections.map((selection) => selection.offerId)).size !== selections.length) {
    throw new Error("REWARD_SELECTION_REQUIRED");
  }
  const selectedItems: ItemInstance[] = [];
  const selectedHeroes: HeroInstance[] = [];
  let shopPool = run.shopPool;
  for (const selection of selections) {
    const offer = byOfferId.get(selection.offerId);
    if (offer === undefined) throw new Error("REWARD_SELECTION_INVALID");
    const option = offer.options.find((candidate) => candidate.id === selection.optionId);
    if (option === undefined) throw new Error("REWARD_SELECTION_INVALID");
    const instanceId = `reward:${run.id}:${plan.round}:${offer.id}:${option.id}`;
    if (option.kind === "normal_item") {
      selectedItems.push({ instanceId, itemId: option.id, kind: "normal" });
    } else {
      if (shopPool !== undefined) {
        shopPool = shopPool === run.shopPool ? cloneShopPool(shopPool) : shopPool;
        reserveHeroFromShopPool(shopPool, option.id);
      }
      selectedHeroes.push({ instanceId, heroId: option.id, cost: option.cost!, stars: 1, poolCopies: shopPool === undefined ? 0 : 1 });
    }
  }
  return {
    ...(selectedItems.length === 0 ? {} : { items: [...(run.items ?? []), ...selectedItems] }),
    ...(selectedHeroes.length === 0 ? {} : { rewardHeroes: [...(run.rewardHeroes ?? []), ...selectedHeroes] }),
    ...(shopPool === run.shopPool ? {} : { shopPool }),
  };
}

export function claimResolvedRoundReward(run: RunRecord, selections: readonly RewardSelection[] = []): RunRecord {
  const resolvedRound = run.combatRecord?.round;
  if (resolvedRound === undefined) throw new Error("COMMAND_NOT_ALLOWED");
  if (run.rewardClaimedRound === resolvedRound) return run;
  if (run.state !== "REWARD") {
    throw new Error("COMMAND_NOT_ALLOWED");
  }

  const materializedRewards = materializeRewardSelections(run, selections);
  const { lockedSnapshot: _lockedSnapshot, roundRewardPlan, ...unlockedRun } = run;
  const freeRefreshes = (run.freeRefreshes ?? 0) + (roundRewardPlan?.freeRefreshes ?? 0);
  return Object.freeze({
    ...unlockedRun,
    gold: run.gold + BASE_WIN_GOLD + (roundRewardPlan?.supplementalGold ?? 0),
    ...(freeRefreshes === 0 ? {} : { freeRefreshes }),
    ...materializedRewards,
    round: resolvedRound === 8 ? resolvedRound : resolvedRound + 1,
    rewardClaimedRound: resolvedRound,
    state: resolvedRound === 8 ? "COMPLETE" : "PREPARE",
    revision: run.revision + 1,
  });
}
