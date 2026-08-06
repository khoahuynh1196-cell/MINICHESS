import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import { buyExperience, initialProgressionState, progressionState } from "../rules/progression.js";
import { equipAdventureItem, unequipAdventureItem } from "./items.js";
import { deployedHeroCount, freezeAdventureRoster, mergeAdventureRoster, moveAdventureHero } from "./roster.js";
import { sellAdventureHero } from "./sell.js";
import {
  commitAdventureMutation,
  freezeAdventureGameState,
  replayAdventureMutation,
  type AdventureCommandReceipt,
  type AdventureGameState,
  type AdventureMutationBase,
  type AdventureMutationResult,
} from "./state.js";
import {
  buyAdventureShopSlot,
  createAdventureShopPool,
  refreshAdventureShop,
  returnAdventureHeroCopies,
  rollAdventureShop,
} from "./shop.js";
import type { AdventureRoster, AdventureRunState, RosterDestination } from "./types.js";

export type AdventureCommandBase = AdventureMutationBase;

export type AdventureCommand =
  | (AdventureCommandBase & { readonly type: "REFRESH_SHOP" })
  | (AdventureCommandBase & { readonly type: "LOCK_SHOP" })
  | (AdventureCommandBase & { readonly type: "BUY_XP" })
  | (AdventureCommandBase & { readonly type: "BUY_SHOP_HERO"; readonly shopSlotIndex: number })
  | (AdventureCommandBase & { readonly type: "MOVE_HERO"; readonly heroInstanceId: string; readonly destination: RosterDestination })
  | (AdventureCommandBase & { readonly type: "SELL_HERO"; readonly heroInstanceId: string })
  | (AdventureCommandBase & { readonly type: "EQUIP_ITEM"; readonly itemInstanceId: string; readonly heroInstanceId: string })
  | (AdventureCommandBase & { readonly type: "UNEQUIP_ITEM"; readonly itemInstanceId: string })
  | (AdventureCommandBase & { readonly type: "CLAIM_REWARD_HERO"; readonly heroInstanceId: string })
  | (AdventureCommandBase & { readonly type: "START_ROUND" });

export type AdventureCommandResult = AdventureMutationResult;
export type { AdventureCommandReceipt, AdventureGameState };

export interface CreateAdventureGameInput {
  readonly id: string;
  readonly seed: string;
  readonly content: CompiledContentBundle;
  readonly rules: CompiledRuleset;
}

function rosterFromRun(run: AdventureRunState): AdventureRoster {
  return { board: run.board, bench: run.bench, items: run.items };
}

function withRoster(run: AdventureRunState, roster: AdventureRoster): AdventureRunState {
  return { ...run, board: roster.board, bench: roster.bench, items: roster.items };
}

function requireNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

export function createAdventureGame(input: CreateAdventureGameInput): AdventureGameState {
  requireNonEmpty(input.id, "Adventure game id");
  requireNonEmpty(input.seed, "Adventure game seed");
  const progression = initialProgressionState(input.rules);
  const emptyRoster = freezeAdventureRoster({
    board: Array((input.rules.board.playerRows.end - input.rules.board.playerRows.start + 1) * input.rules.board.columns).fill(null),
    bench: Array(input.rules.roster.benchSlots).fill(null),
    items: [],
  });
  const initialPool = createAdventureShopPool(input.content, input.rules, input.seed);
  const initialRoll = rollAdventureShop(initialPool, input.rules, progression.level, "round:1:refresh:0");
  return freezeAdventureGameState({
    seed: input.seed,
    run: {
      id: input.id,
      revision: 0,
      phase: "PREPARE",
      rulesetVersion: input.rules.version,
      contentVersion: input.content.version,
      round: 1,
      gold: input.rules.adventure.initialGold,
      health: input.rules.adventure.initialHealth,
      level: progression.level,
      experience: progression.experience,
      board: emptyRoster.board,
      bench: emptyRoster.bench,
      items: emptyRoster.items,
      shop: initialRoll.slots,
      shopLocked: false,
      freeRefreshes: 0,
      rewardHeroes: [],
    },
    shopPool: initialRoll.pool,
    refreshNumber: 0,
    acquisitionCounter: 0,
    commandHistory: {},
  });
}

export function applyAdventureCommand(
  state: AdventureGameState,
  command: AdventureCommand,
  rules: CompiledRuleset,
): AdventureCommandResult {
  const replay = replayAdventureMutation(state, command);
  if (replay !== undefined) return replay;
  if (state.run.phase !== "PREPARE") throw new Error("ADVENTURE_COMMAND_NOT_ALLOWED");
  if (state.run.rulesetVersion !== rules.version) throw new Error("ADVENTURE_RULESET_MISMATCH");

  const currentProgression = progressionState(rules, state.run.level, state.run.experience);
  let run = state.run;
  let shopPool = state.shopPool;
  let refreshNumber = state.refreshNumber;
  let acquisitionCounter = state.acquisitionCounter;

  switch (command.type) {
    case "REFRESH_SHOP": {
      if (run.shopLocked) throw new Error("ADVENTURE_SHOP_LOCKED");
      const usesFreeRefresh = run.freeRefreshes > 0;
      if (!usesFreeRefresh && run.gold < rules.shop.refreshCost) throw new Error("ADVENTURE_NOT_ENOUGH_GOLD");
      refreshNumber += 1;
      const refreshed = refreshAdventureShop(
        shopPool,
        run.shop,
        rules,
        run.level,
        `round:${run.round}:refresh:${refreshNumber}`,
      );
      shopPool = refreshed.pool;
      run = {
        ...run,
        shop: refreshed.slots,
        gold: usesFreeRefresh ? run.gold : run.gold - rules.shop.refreshCost,
        freeRefreshes: usesFreeRefresh ? run.freeRefreshes - 1 : run.freeRefreshes,
      };
      break;
    }
    case "LOCK_SHOP":
      run = { ...run, shopLocked: !run.shopLocked };
      break;
    case "BUY_XP": {
      if (run.gold < rules.progression.xpPurchaseCost) throw new Error("ADVENTURE_NOT_ENOUGH_GOLD");
      const next = buyExperience(rules, currentProgression);
      run = {
        ...run,
        gold: run.gold - rules.progression.xpPurchaseCost,
        level: next.level,
        experience: next.experience,
      };
      break;
    }
    case "BUY_SHOP_HERO": {
      const purchase = buyAdventureShopSlot(run.shop, command.shopSlotIndex);
      if (run.gold < purchase.purchased.cost) throw new Error("ADVENTURE_NOT_ENOUGH_GOLD");
      const emptyBenchIndex = run.bench.findIndex((hero) => hero === null);
      if (emptyBenchIndex < 0) throw new Error("ADVENTURE_BENCH_FULL");
      acquisitionCounter += 1;
      const bench = [...run.bench];
      bench[emptyBenchIndex] = Object.freeze({
        instanceId: `hero:${run.id}:${command.commandId}`,
        heroId: purchase.purchased.heroId,
        cost: purchase.purchased.cost,
        stars: 1,
        poolCopies: 1,
        acquisitionOrder: acquisitionCounter,
      });
      const purchasedRoster = mergeAdventureRoster(rules, {
        board: run.board,
        bench,
        items: run.items,
      }, currentProgression.boardCap);
      run = withRoster({
        ...run,
        gold: run.gold - purchase.purchased.cost,
        shop: purchase.slots,
      }, purchasedRoster);
      break;
    }
    case "MOVE_HERO":
      run = withRoster(run, moveAdventureHero(
        rules,
        rosterFromRun(run),
        currentProgression.boardCap,
        command.heroInstanceId,
        command.destination,
      ));
      break;
    case "SELL_HERO": {
      const sale = sellAdventureHero(rules, rosterFromRun(run), currentProgression.boardCap, command.heroInstanceId);
      if (sale.sold.poolCopies > 0) {
        shopPool = returnAdventureHeroCopies(shopPool, sale.sold.heroId, sale.sold.poolCopies);
      }
      run = withRoster({ ...run, gold: run.gold + sale.goldValue }, sale.roster);
      break;
    }
    case "EQUIP_ITEM":
      run = withRoster(run, equipAdventureItem(
        rules,
        rosterFromRun(run),
        currentProgression.boardCap,
        command.itemInstanceId,
        command.heroInstanceId,
      ));
      break;
    case "UNEQUIP_ITEM":
      run = withRoster(run, unequipAdventureItem(
        rules,
        rosterFromRun(run),
        currentProgression.boardCap,
        command.itemInstanceId,
      ));
      break;
    case "CLAIM_REWARD_HERO": {
      const reward = run.rewardHeroes.find((hero) => hero.instanceId === command.heroInstanceId);
      if (reward === undefined) throw new Error(`Adventure reward hero not found: ${command.heroInstanceId}`);
      const emptyBenchIndex = run.bench.findIndex((hero) => hero === null);
      if (emptyBenchIndex < 0) throw new Error("ADVENTURE_BENCH_FULL");
      const bench = [...run.bench];
      bench[emptyBenchIndex] = reward;
      const claimedRoster = mergeAdventureRoster(rules, {
        board: run.board,
        bench,
        items: run.items,
      }, currentProgression.boardCap);
      run = withRoster({
        ...run,
        rewardHeroes: run.rewardHeroes.filter((hero) => hero.instanceId !== command.heroInstanceId),
      }, claimedRoster);
      break;
    }
    case "START_ROUND":
      if (run.rewardHeroes.length > 0) throw new Error("ADVENTURE_PENDING_HERO_REWARD");
      if (deployedHeroCount(run) === 0) throw new Error("ADVENTURE_BOARD_EMPTY");
      run = { ...run, phase: "COMBAT" };
      break;
  }

  return commitAdventureMutation(state, command, {
    seed: state.seed,
    run,
    shopPool,
    refreshNumber,
    acquisitionCounter,
    ...(state.pendingReward === undefined ? {} : { pendingReward: state.pendingReward }),
    ...(state.lastCombat === undefined ? {} : { lastCombat: state.lastCombat }),
  });
}
