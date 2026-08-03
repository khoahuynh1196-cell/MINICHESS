import { randomBytes } from "node:crypto";
import type { CombatEvent } from "@auto-battler/game-core";
import { claimResolvedRoundReward } from "./round-lifecycle.js";
import type { RoundRewardPlan, RewardSelection } from "./reward-selection.js";
import { cloneShopPool, returnHeroToShopPool, returnShopSlots, type ShopPool, type ShopSlot } from "./shop-pool.js";
import { selectRunUniqueId } from "./unique-selection.js";

export type { ShopSlot } from "./shop-pool.js";

export interface RunRecord {
  readonly id: string;
  readonly tenantId: string;
  readonly contentVersion: string;
  readonly state: "PREPARE" | "COMBAT" | "REWARD" | "COMPLETE";
  readonly round?: number;
  readonly revision: number;
  readonly gold: number;
  /** Current player level. Missing values retain the legacy round-derived progression. */
  readonly level?: number;
  /** Experience earned toward the next player level. */
  readonly experience?: number;
  readonly health?: number;
  /** Private server-only entropy; never include this in a public run view. */
  /** Optional only to permit loading pre-seed Alpha records during migration. */
  readonly runSeed?: string;
  readonly preselectedUniqueId?: string;
  readonly uniqueRevealed?: boolean;
  readonly uniqueRevealAcknowledged?: boolean;
  readonly commandResponses: Readonly<Record<string, RunCommandResult>>;
  readonly commandRequests?: Readonly<Record<string, string>>;
  readonly shop?: readonly (ShopSlot | null)[];
  /** The server-owned shop lock state. A locked shop cannot be refreshed. */
  readonly shopLocked?: boolean;
  /** Private, authoritative pool state; never include this in a public run view. */
  readonly shopPool?: ShopPool;
  readonly shopRefreshes?: number;
  /** Content-awarded shop refreshes that must be consumed before gold. */
  readonly freeRefreshes?: number;
  readonly bench?: readonly HeroInstance[];
  readonly board?: readonly (HeroInstance | null)[];
  readonly lockedSnapshot?: LockedRoundSnapshot;
  readonly combatRecord?: CombatRecord;
  /** The completed combat round whose base reward was already applied. */
  readonly rewardClaimedRound?: number;
  /** Server-derived rewards for the current resolved round. */
  readonly roundRewardPlan?: RoundRewardPlan;
  /** Claimed hero rewards waiting for a bench slot during PREPARE. */
  readonly rewardHeroes?: readonly HeroInstance[];
  readonly items?: readonly ItemInstance[];
}

export interface CombatRecord {
  readonly round: number;
  readonly winner: "player" | "enemy";
  readonly resultHash: string;
  readonly finalTick: number;
  readonly reason: "elimination" | "timeout";
  readonly events: readonly CombatEvent[];
}

export interface HeroInstance {
  readonly instanceId: string;
  readonly heroId: string;
  readonly cost: number;
  readonly stars?: 1 | 2 | 3;
  /** Number of pool copies reserved for this instance; absent only on migrated records. */
  readonly poolCopies?: number;
}
export interface ItemInstance { readonly instanceId: string; readonly itemId: string; readonly kind: "normal" | "unique"; readonly equippedHeroInstanceId?: string; }
export interface LockedRoundSnapshot {
  readonly runId: string;
  readonly contentVersion: string;
  readonly round: number;
  readonly board: readonly (HeroInstance | null)[];
  readonly items?: readonly ItemInstance[];
  readonly combatId?: string;
  readonly combatSeed?: string;
  readonly rulesetVersion?: string;
}

export interface RunCommandResult {
  readonly runRevision: number;
  readonly status: "APPLIED";
}

export interface RunCommandInput {
  readonly actorId: string;
  readonly tenantId: string;
  readonly runId: string;
  readonly commandId: string;
  readonly expectedRevision: number;
  readonly type: "REFRESH_SHOP" | "LOCK_SHOP" | "ABANDON_RUN" | "BUY_XP" | "BUY_SHOP_HERO" | "SELL_HERO" | "MOVE_HERO" | "EQUIP_ITEM" | "UNEQUIP_ITEM" | "START_ROUND" | "CLAIM_ROUND_REWARD" | "ACK_UNIQUE_REVEAL" | "CLAIM_REWARD_HERO";
  readonly shopSlotIndex?: number;
  readonly heroInstanceId?: string;
  readonly itemInstanceId?: string;
  readonly destination?: number;
  readonly revealId?: string;
  readonly rewardSelections?: readonly RewardSelection[];
}

export interface RunRepository {
  get(runId: string, tenantId: string): Promise<RunRecord | undefined>;
  findActiveByTenant(tenantId: string): Promise<RunRecord | undefined>;
  save(run: RunRecord): Promise<void>;
  saveIfRevision(run: RunRecord, expectedRevision: number): Promise<RunRecord | undefined>;
}

export interface ShopGenerator {
  /** New generators create and mutate a persisted per-run shop pool. */
  createPool?(input: Pick<CreateRunInput, "id" | "contentVersion"> & { readonly runSeed: string }): ShopPool;
  rollShop?(pool: ShopPool, input: { readonly round: number; readonly refreshNumber: number; readonly level: number }): readonly ShopSlot[];
  /** Legacy adapter retained while independently injected tests migrate. */
  initialShop?(input: Pick<CreateRunInput, "id" | "contentVersion">): readonly ShopSlot[];
  refreshShop?(input: Pick<CreateRunInput, "id" | "contentVersion"> & { readonly refreshNumber: number }): readonly ShopSlot[];
}

export interface CreateRunInput {
  readonly id: string;
  readonly tenantId: string;
  readonly contentVersion: string;
}

export interface CreateRunSetup {
  /** Injection exists only for deterministic server tests and replay restoration. */
  readonly runSeed?: string;
  readonly uniqueItemIds?: readonly string[];
}

const ALPHA_RULESET_VERSION = "alpha-rules-0.3.0";
const INITIAL_PLAYER_LEVEL = 3;
const MAX_PLAYER_LEVEL = 10;
const MAX_PLAYER_BOARD_CAP = 6;
const XP_PER_PURCHASE = 4;
const XP_TO_NEXT_BY_LEVEL = [0, 2, 6, 10, 20, 36, 56, 80, 100, 100, 0] as const;

export interface RunProgression {
  readonly level: number;
  readonly experience: number;
  readonly experienceToNext: number;
  readonly boardCap: number;
}

function legacyLevelForRound(round: number | undefined): number {
  return Math.min(Math.max(round ?? 1, 1) + 2, MAX_PLAYER_BOARD_CAP);
}

export function progressionForRun(run: Pick<RunRecord, "level" | "experience" | "round">): RunProgression {
  const level = run.level ?? legacyLevelForRound(run.round);
  const experience = run.experience ?? 0;
  const experienceToNext = XP_TO_NEXT_BY_LEVEL[level];
  if (!Number.isInteger(level) || level < 1 || level > MAX_PLAYER_LEVEL || !Number.isInteger(experience) || experience < 0 || experienceToNext === undefined || (experienceToNext === 0 ? experience !== 0 : experience >= experienceToNext)) {
    throw new Error("GAME_RULE_VIOLATION");
  }
  return Object.freeze({ level, experience, experienceToNext, boardCap: Math.min(level, MAX_PLAYER_BOARD_CAP) });
}

function buyExperience(progression: RunProgression): Pick<RunProgression, "level" | "experience"> {
  let level = progression.level;
  let experience = progression.experience + XP_PER_PURCHASE;
  while (level < MAX_PLAYER_LEVEL && experience >= XP_TO_NEXT_BY_LEVEL[level]!) {
    experience -= XP_TO_NEXT_BY_LEVEL[level]!;
    level += 1;
  }
  return { level, experience: level === MAX_PLAYER_LEVEL ? 0 : experience };
}

function lockRoundSnapshot(run: RunRecord, board: readonly (HeroInstance | null)[], items: readonly ItemInstance[]): LockedRoundSnapshot {
  const lockedBoard = Object.freeze(board.map((hero) => hero === null ? null : Object.freeze({ ...hero })));
  const lockedItems = Object.freeze(items.map((item) => Object.freeze({ ...item })));
  const round = run.round ?? 1;
  return Object.freeze({
    runId: run.id,
    contentVersion: run.contentVersion,
    round,
    board: lockedBoard,
    items: lockedItems,
    combatId: `combat:${run.id}:${round}`,
    combatSeed: randomBytes(16).toString("hex"),
    rulesetVersion: ALPHA_RULESET_VERSION,
  });
}

interface MergeableHero {
  readonly hero: HeroInstance;
  readonly location: "board" | "bench";
  readonly index: number;
}

interface MergedRoster {
  readonly board: readonly (HeroInstance | null)[];
  readonly bench: readonly HeroInstance[];
  readonly items: readonly ItemInstance[];
}

function heroStars(hero: HeroInstance): 1 | 2 | 3 {
  const stars = hero.stars ?? 1;
  if (stars !== 1 && stars !== 2 && stars !== 3) throw new Error("GAME_RULE_VIOLATION");
  return stars;
}

function reservedPoolCopies(hero: HeroInstance): number {
  const representedCopies = 3 ** (heroStars(hero) - 1);
  // Pre-pool reward records used the durable reward:<run>:... instance format
  // but did not reserve supply. Treat that missing metadata as zero so a
  // migration-era claim, merge, or sale cannot mint or overflow the pool.
  if (hero.poolCopies === undefined && hero.instanceId.startsWith("reward:")) return 0;
  const copies = hero.poolCopies ?? representedCopies;
  if (!Number.isSafeInteger(copies) || copies < 0 || copies > representedCopies) throw new Error("GAME_RULE_VIOLATION");
  return copies;
}

function returnItemsFromMergedHeroes(items: readonly ItemInstance[], mergedHeroIds: ReadonlySet<string>): readonly ItemInstance[] {
  return items.map((item) => {
    if (item.equippedHeroInstanceId === undefined || !mergedHeroIds.has(item.equippedHeroInstanceId)) return item;
    const { equippedHeroInstanceId: _, ...returnedItem } = item;
    return returnedItem;
  });
}

function mergeEligibleHeroes(boardInput: readonly (HeroInstance | null)[], benchInput: readonly HeroInstance[], itemsInput: readonly ItemInstance[]): MergedRoster {
  let board = [...boardInput];
  let bench = [...benchInput];
  let items = [...itemsInput];
  for (const stars of [1, 2] as const) {
    for (;;) {
      const candidates: MergeableHero[] = [
        ...board.flatMap((hero, index) => hero === null ? [] : [{ hero, location: "board" as const, index }]),
        ...bench.map((hero, index) => ({ hero, location: "bench" as const, index })),
      ];
      const mergeGroup = candidates.find((candidate) => candidates.filter((other) => other.hero.heroId === candidate.hero.heroId && heroStars(other.hero) === stars).length >= 3);
      if (mergeGroup === undefined) break;
      const selected = candidates.filter((candidate) => candidate.hero.heroId === mergeGroup.hero.heroId && heroStars(candidate.hero) === stars).slice(0, 3);
      const selectedIds = new Set(selected.map((candidate) => candidate.hero.instanceId));
      const survivor = selected[0]!;
      const mergedHero: HeroInstance = { ...survivor.hero, stars: (stars + 1) as 2 | 3, poolCopies: selected.reduce((total, candidate) => total + reservedPoolCopies(candidate.hero), 0) };
      if (survivor.location === "board") {
        board = board.map((hero) => hero !== null && selectedIds.has(hero.instanceId) ? null : hero);
        bench = bench.filter((hero) => !selectedIds.has(hero.instanceId));
        board[survivor.index] = mergedHero;
      } else {
        const benchInsertionIndex = survivor.index - selected.filter((candidate) => candidate.location === "bench" && candidate.index < survivor.index).length;
        board = board.map((hero) => hero !== null && selectedIds.has(hero.instanceId) ? null : hero);
        bench = bench.filter((hero) => !selectedIds.has(hero.instanceId));
        bench.splice(benchInsertionIndex, 0, mergedHero);
      }
      items = [...returnItemsFromMergedHeroes(items, selectedIds)];
    }
  }
  return { board, bench, items };
}

function assertValidShop(shop: unknown, slotCount = 4): asserts shop is readonly ShopSlot[] {
  if (!Array.isArray(shop) || shop.length !== slotCount || shop.some((slot) =>
    typeof slot?.heroId !== "string" || slot.heroId !== slot.heroId.trim() || slot.heroId.length === 0 || !Number.isInteger(slot.cost) || slot.cost < 1 || slot.cost > 5,
  )) throw new Error("GAME_RULE_VIOLATION");
}

export function createInMemoryRunRepository(): RunRepository {
  const runs = new Map<string, RunRecord>();
  return {
    async get(runId, tenantId) {
      const run = runs.get(runId);
      return run?.tenantId === tenantId ? run : undefined;
    },
    async findActiveByTenant(tenantId) {
      return [...runs.values()].find((run) => run.tenantId === tenantId && run.state !== "COMPLETE");
    },
    async save(run) { runs.set(run.id, run); },
    async saveIfRevision(run, expectedRevision) {
      const current = runs.get(run.id);
      if (current === undefined || current.tenantId !== run.tenantId || current.revision !== expectedRevision) return undefined;
      runs.set(run.id, run);
      return run;
    },
  };
}

export async function createRun(input: CreateRunInput, repository: RunRepository, shopGenerator?: ShopGenerator, setup?: CreateRunSetup): Promise<RunRecord> {
  if (await repository.findActiveByTenant(input.tenantId) !== undefined) throw new Error("ACTIVE_RUN_EXISTS");
  const runSeed = setup?.runSeed ?? randomBytes(32).toString("hex");
  const shopPool = shopGenerator?.createPool?.({ id: input.id, contentVersion: input.contentVersion, runSeed });
  const initialPoolRoll = shopGenerator?.rollShop;
  if (shopPool !== undefined && initialPoolRoll === undefined) throw new Error("GAME_RULE_VIOLATION");
  const shop = shopPool === undefined
    ? shopGenerator?.initialShop?.({ id: input.id, contentVersion: input.contentVersion })
    : initialPoolRoll!(shopPool, { round: 1, refreshNumber: 0, level: INITIAL_PLAYER_LEVEL });
  if (shop !== undefined) assertValidShop(shop, shopPool === undefined ? 4 : 5);
  const preselectedUniqueId = setup?.uniqueItemIds === undefined ? undefined : selectRunUniqueId(runSeed, setup.uniqueItemIds);
  const run: RunRecord = {
    id: input.id,
    tenantId: input.tenantId,
    contentVersion: input.contentVersion,
    state: "PREPARE",
    round: 1,
    revision: 0,
    gold: 8,
    level: INITIAL_PLAYER_LEVEL,
    experience: 0,
    health: 30,
    runSeed,
    ...(preselectedUniqueId === undefined ? {} : { preselectedUniqueId, uniqueRevealed: false }),
    commandResponses: {},
    bench: [],
    board: Array(12).fill(null),
    ...(shop === undefined ? {} : { shop }),
    ...(shopPool === undefined ? {} : { shopPool }),
  };
  await repository.save(run);
  return run;
}

export async function applyRunCommand(input: RunCommandInput, repository: RunRepository, shopGenerator?: ShopGenerator): Promise<RunCommandResult> {
  const run = await repository.get(input.runId, input.tenantId);
  if (run === undefined) throw new Error("RUN_NOT_FOUND");
  const replay = run.commandResponses[input.commandId];
  const fingerprint = JSON.stringify({ runId: input.runId, expectedRevision: input.expectedRevision, type: input.type, shopSlotIndex: input.shopSlotIndex, heroInstanceId: input.heroInstanceId, itemInstanceId: input.itemInstanceId, destination: input.destination, revealId: input.revealId, rewardSelections: input.rewardSelections });
  if (replay !== undefined) {
    if (run.commandRequests?.[input.commandId] !== fingerprint) throw new Error("IDEMPOTENCY_KEY_REUSED");
    return replay;
  }
  if (run.revision !== input.expectedRevision) throw new Error("RUN_REVISION_CONFLICT");
  if (input.type === "CLAIM_ROUND_REWARD") {
    const claimed = claimResolvedRoundReward(run, input.rewardSelections);
    const result: RunCommandResult = { runRevision: claimed.revision, status: "APPLIED" };
    const saved = Object.freeze({
      ...claimed,
      commandResponses: { ...claimed.commandResponses, [input.commandId]: result },
      commandRequests: { ...claimed.commandRequests, [input.commandId]: fingerprint },
    });
    if (await repository.saveIfRevision(saved, run.revision) === undefined) throw new Error("RUN_REVISION_CONFLICT");
    return result;
  }
  if (input.type === "ACK_UNIQUE_REVEAL") {
    if (run.uniqueRevealed !== true || run.uniqueRevealAcknowledged === true || input.revealId === undefined || !run.items?.some((item) => item.kind === "unique" && item.instanceId === input.revealId && item.itemId === run.preselectedUniqueId)) {
      throw new Error("COMMAND_NOT_ALLOWED");
    }
    const result: RunCommandResult = { runRevision: run.revision + 1, status: "APPLIED" };
    const saved = Object.freeze({
      ...run,
      uniqueRevealAcknowledged: true,
      revision: result.runRevision,
      commandResponses: { ...run.commandResponses, [input.commandId]: result },
      commandRequests: { ...run.commandRequests, [input.commandId]: fingerprint },
    });
    if (await repository.saveIfRevision(saved, run.revision) === undefined) throw new Error("RUN_REVISION_CONFLICT");
    return result;
  }
  if (run.state !== "PREPARE") throw new Error("COMMAND_NOT_ALLOWED");
  const progression = progressionForRun(run);
  if (input.type === "REFRESH_SHOP" && run.shopLocked === true) throw new Error("COMMAND_NOT_ALLOWED");
  const usesFreeRefresh = input.type === "REFRESH_SHOP" && (run.freeRefreshes ?? 0) > 0;
  if (input.type === "REFRESH_SHOP" && !usesFreeRefresh && run.gold < 2) throw new Error("GAME_RULE_VIOLATION");
  if (input.type === "BUY_XP" && (run.gold < 4 || progression.level === MAX_PLAYER_LEVEL)) throw new Error("GAME_RULE_VIOLATION");
  const purchasedSlot = input.type === "BUY_SHOP_HERO" ? run.shop?.[input.shopSlotIndex ?? -1] : undefined;
  if (input.type === "BUY_SHOP_HERO" && (purchasedSlot === undefined || purchasedSlot === null || run.gold < purchasedSlot.cost || (run.bench?.length ?? 0) >= 8)) throw new Error("GAME_RULE_VIOLATION");
  const currentBoard = run.board ?? Array(12).fill(null);
  const currentBench = run.bench ?? [];
  const currentItems = run.items ?? [];
  const claimedRewardHero = input.type === "CLAIM_REWARD_HERO" ? run.rewardHeroes?.find((hero) => hero.instanceId === input.heroInstanceId) : undefined;
  if (input.type === "CLAIM_REWARD_HERO" && (claimedRewardHero === undefined || currentBench.length >= 8)) throw new Error("GAME_RULE_VIOLATION");
  const soldHero = input.type === "SELL_HERO"
    ? currentBench.find((hero) => hero.instanceId === input.heroInstanceId) ?? currentBoard.find((hero) => hero?.instanceId === input.heroInstanceId)
    : undefined;
  if (input.type === "SELL_HERO" && soldHero === undefined) throw new Error("GAME_RULE_VIOLATION");
  const boardHeroCount = currentBoard.filter((hero) => hero !== null).length;
  if (input.type === "START_ROUND" && (boardHeroCount === 0 || boardHeroCount > progression.boardCap)) throw new Error("GAME_RULE_VIOLATION");
  const allHeroes = [...currentBench, ...currentBoard.filter((hero): hero is HeroInstance => hero !== null)];
  if (currentItems.filter((item) => item.kind === "unique").length > 1) throw new Error("GAME_RULE_VIOLATION");
  const equippedItem = input.type === "EQUIP_ITEM" || input.type === "UNEQUIP_ITEM" ? currentItems.find((item) => item.instanceId === input.itemInstanceId) : undefined;
  const equipHero = input.type === "EQUIP_ITEM" ? allHeroes.find((hero) => hero.instanceId === input.heroInstanceId) : undefined;
  const equippedOnHero = input.type === "EQUIP_ITEM" ? currentItems.filter((item) => item.equippedHeroInstanceId === input.heroInstanceId) : [];
  if (input.type === "EQUIP_ITEM" && (equippedItem === undefined || equippedItem.equippedHeroInstanceId !== undefined || equipHero === undefined || equippedOnHero.length >= 2 || (equippedItem.kind === "unique" && equippedOnHero.some((item) => item.kind === "unique")))) throw new Error("GAME_RULE_VIOLATION");
  if (input.type === "UNEQUIP_ITEM" && (equippedItem === undefined || equippedItem.equippedHeroInstanceId === undefined)) throw new Error("GAME_RULE_VIOLATION");
  const benchSourceIndex = input.type === "MOVE_HERO" ? currentBench.findIndex((hero) => hero.instanceId === input.heroInstanceId) : -1;
  const boardSourceIndex = input.type === "MOVE_HERO" ? currentBoard.findIndex((hero) => hero?.instanceId === input.heroInstanceId) : -1;
  const destination = input.type === "MOVE_HERO" ? input.destination ?? -1 : -1;
  const destinationIndex = destination - 12;
  const destinationIsBoard = destinationIndex >= 0 && destinationIndex < 12;
  const destinationIsBench = destination >= 0 && destination < 8;
  if (input.type === "MOVE_HERO" && (
    !Number.isInteger(input.destination)
    || (!destinationIsBoard && !destinationIsBench)
    || (benchSourceIndex === -1 && boardSourceIndex === -1)
    || (destinationIsBoard && destinationIndex === boardSourceIndex)
    || (destinationIsBench && benchSourceIndex === destination)
    || (destinationIsBench && boardSourceIndex !== -1 && currentBench.length >= 8)
    || (destinationIsBench && destination > (benchSourceIndex === -1 ? currentBench.length : currentBench.length - 1))
  )) throw new Error("GAME_RULE_VIOLATION");
  const movingHero = input.type === "MOVE_HERO" ? (benchSourceIndex !== -1 ? currentBench[benchSourceIndex] : currentBoard[boardSourceIndex]) : undefined;
  const displacedHero = input.type === "MOVE_HERO" && destinationIsBoard ? currentBoard[destinationIndex] : undefined;
  if (input.type === "MOVE_HERO" && destinationIsBoard && benchSourceIndex !== -1 && displacedHero === null && currentBoard.filter((hero) => hero !== null).length >= progression.boardCap) throw new Error("GAME_RULE_VIOLATION");
  const result: RunCommandResult = { runRevision: run.revision + 1, status: "APPLIED" };
  const refreshNumber = (run.shopRefreshes ?? 0) + 1;
  const pooledRefresh = input.type === "REFRESH_SHOP" && run.shopPool !== undefined;
  if (pooledRefresh && shopGenerator?.rollShop === undefined) throw new Error("GAME_RULE_VIOLATION");
  const refreshedPool = pooledRefresh ? cloneShopPool(run.shopPool!) : undefined;
  if (refreshedPool !== undefined) returnShopSlots(refreshedPool, run.shop ?? []);
  const refreshShop = input.type === "REFRESH_SHOP" && refreshedPool === undefined ? shopGenerator?.refreshShop : undefined;
  const refreshedShop = refreshedPool === undefined
    ? refreshShop?.({ id: run.id, contentVersion: run.contentVersion, refreshNumber })
    : shopGenerator!.rollShop!(refreshedPool, { round: run.round ?? 1, refreshNumber, level: progression.level });
  if (refreshedShop !== undefined) assertValidShop(refreshedShop, refreshedPool === undefined ? 4 : 5);
  const shop = input.type === "BUY_SHOP_HERO" ? (run.shop ?? []).map((slot, index) => index === input.shopSlotIndex ? null : slot) : refreshedShop ?? run.shop;
  const movedBoard = input.type === "MOVE_HERO"
    ? destinationIsBoard
      ? currentBoard.map((hero, index) => index === destinationIndex ? movingHero! : index === boardSourceIndex ? displacedHero! : hero)
      : currentBoard.map((hero, index) => index === boardSourceIndex ? null : hero)
    : input.type === "SELL_HERO" && run.board !== undefined
      ? currentBoard.map((hero) => hero?.instanceId === input.heroInstanceId ? null : hero)
      : run.board;
  const bench = input.type === "BUY_SHOP_HERO"
    ? [...(run.bench ?? []), { instanceId: `hero:${run.id}:${input.commandId}`, heroId: purchasedSlot!.heroId, cost: purchasedSlot!.cost, stars: 1 as const, poolCopies: 1 }]
    : input.type === "CLAIM_REWARD_HERO" ? [...currentBench, claimedRewardHero!]
    : input.type === "SELL_HERO" ? (run.bench ?? []).filter((hero) => hero.instanceId !== input.heroInstanceId)
      : input.type === "MOVE_HERO"
        ? (() => {
          const nextBench = benchSourceIndex !== -1 ? currentBench.filter((hero) => hero.instanceId !== input.heroInstanceId) : [...currentBench];
          if (destinationIsBench) nextBench.splice(destination, 0, movingHero!);
          else if (benchSourceIndex !== -1 && displacedHero !== null && displacedHero !== undefined) nextBench.push(displacedHero);
          return nextBench;
        })()
        : run.bench;
  const gold = input.type === "REFRESH_SHOP" ? (usesFreeRefresh ? run.gold : run.gold - 2) : input.type === "BUY_XP" ? run.gold - 4 : input.type === "BUY_SHOP_HERO" ? run.gold - purchasedSlot!.cost : input.type === "SELL_HERO" ? run.gold + soldHero!.cost : run.gold;
  const updatedProgression = input.type === "BUY_XP" ? buyExperience(progression) : progression;
  const freeRefreshes = input.type === "REFRESH_SHOP" && usesFreeRefresh ? (run.freeRefreshes ?? 0) - 1 : run.freeRefreshes;
  const shopPool = input.type === "SELL_HERO" && run.shopPool !== undefined ? cloneShopPool(run.shopPool) : refreshedPool ?? run.shopPool;
  if (input.type === "SELL_HERO" && shopPool !== undefined) {
    const copies = reservedPoolCopies(soldHero!);
    if (copies > 0) returnHeroToShopPool(shopPool, soldHero!.heroId, copies);
  }
  const items = input.type === "EQUIP_ITEM"
    ? currentItems.map((item) => item.instanceId === input.itemInstanceId ? { ...item, equippedHeroInstanceId: input.heroInstanceId! } : item)
    : input.type === "UNEQUIP_ITEM"
      ? currentItems.map((item) => item.instanceId === input.itemInstanceId ? { instanceId: item.instanceId, itemId: item.itemId, kind: item.kind } : item)
      : input.type === "SELL_HERO" && run.items !== undefined
        ? currentItems.map((item) => {
          if (item.equippedHeroInstanceId !== input.heroInstanceId) return item;
          const { equippedHeroInstanceId: _, ...returnedItem } = item;
          return returnedItem;
        })
      : run.items;
  const mergedRoster = input.type === "BUY_SHOP_HERO" || input.type === "CLAIM_REWARD_HERO"
    ? mergeEligibleHeroes(movedBoard ?? currentBoard, bench ?? currentBench, items ?? currentItems)
    : undefined;
  const lockedSnapshot = input.type === "START_ROUND" ? lockRoundSnapshot(run, currentBoard, currentItems) : run.lockedSnapshot;
  const saved = Object.freeze({
    ...run,
    gold,
    level: updatedProgression.level,
    experience: updatedProgression.experience,
    ...(shop === undefined ? {} : { shop }),
    ...(input.type === "LOCK_SHOP" ? { shopLocked: run.shopLocked !== true } : run.shopLocked === undefined ? {} : { shopLocked: run.shopLocked }),
    ...(shopPool === undefined ? {} : { shopPool }),
    ...(input.type === "REFRESH_SHOP" ? { shopRefreshes: refreshNumber } : run.shopRefreshes === undefined ? {} : { shopRefreshes: run.shopRefreshes }),
    ...(freeRefreshes === undefined ? {} : { freeRefreshes }),
    ...(bench === undefined ? {} : { bench: mergedRoster?.bench ?? bench }),
    ...(movedBoard === undefined ? {} : { board: mergedRoster?.board ?? movedBoard }),
    ...(items === undefined ? {} : { items: mergedRoster?.items ?? items }),
    ...(input.type === "CLAIM_REWARD_HERO" ? { rewardHeroes: (run.rewardHeroes ?? []).filter((hero) => hero.instanceId !== input.heroInstanceId) } : run.rewardHeroes === undefined ? {} : { rewardHeroes: run.rewardHeroes }),
    ...(lockedSnapshot === undefined ? {} : { lockedSnapshot }),
    state: input.type === "ABANDON_RUN" ? "COMPLETE" : input.type === "START_ROUND" ? "COMBAT" : run.state,
    revision: result.runRevision,
    commandResponses: { ...run.commandResponses, [input.commandId]: result },
    commandRequests: { ...run.commandRequests, [input.commandId]: fingerprint },
  });
  if (await repository.saveIfRevision(saved, run.revision) === undefined) throw new Error("RUN_REVISION_CONFLICT");
  return result;
}
