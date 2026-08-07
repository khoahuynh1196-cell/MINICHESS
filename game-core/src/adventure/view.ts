import type { CompiledContentBundle } from "../content/types.js";
import { progressionState, shopOddsAtLevel } from "../rules/progression.js";
import type { CompiledRuleset, ShopOdds } from "../rules/types.js";
import { deployedHeroCount } from "./roster.js";
import type { AdventureRewardPlan } from "./rewards.js";
import type { AdventureCombatSummary, AdventureGameState } from "./state.js";
import type {
  AdventureHeroInstance,
  AdventureItemInstance,
  AdventurePhase,
  AdventureShopSlot,
} from "./types.js";
import { assertAdventureGameState } from "./validation.js";

export interface AdventureActionAvailability {
  readonly allowed: boolean;
  readonly reason?: string;
}

export interface AdventureActions {
  readonly refreshShop: AdventureActionAvailability;
  readonly lockShop: AdventureActionAvailability;
  readonly buyXp: AdventureActionAvailability;
  readonly moveHero: AdventureActionAvailability;
  readonly sellHero: AdventureActionAvailability;
  readonly equipItem: AdventureActionAvailability;
  readonly unequipItem: AdventureActionAvailability;
  readonly claimRewardHero: AdventureActionAvailability;
  readonly startRound: AdventureActionAvailability;
  readonly resolveCombat: AdventureActionAvailability;
  readonly ackPlaybackComplete: AdventureActionAvailability;
  readonly claimRoundReward: AdventureActionAvailability;
  readonly buyShopSlots: readonly AdventureActionAvailability[];
}

export interface AdventureTraitView {
  readonly traitId: string;
  readonly count: number;
  readonly activeBreakpoint: number;
  readonly nextBreakpoint?: number;
}

export interface AdventureView {
  readonly id: string;
  readonly revision: number;
  readonly phase: AdventurePhase;
  readonly rulesetVersion: string;
  readonly contentVersion: string;
  readonly round: number;
  readonly gold: number;
  readonly health: number;
  readonly level: number;
  readonly experience: number;
  readonly experienceToNext: number;
  readonly boardCap: number;
  readonly shopOdds: ShopOdds;
  readonly shop: readonly (AdventureShopSlot | null)[];
  readonly shopLocked: boolean;
  readonly freeRefreshes: number;
  readonly board: readonly (AdventureHeroInstance | null)[];
  readonly bench: readonly (AdventureHeroInstance | null)[];
  readonly items: readonly AdventureItemInstance[];
  readonly rewardHeroes: readonly AdventureHeroInstance[];
  readonly traits: readonly AdventureTraitView[];
  readonly actions: AdventureActions;
  readonly pendingReward?: AdventureRewardPlan;
  readonly lastCombat?: AdventureCombatSummary;
}

function allowed(): AdventureActionAvailability {
  return Object.freeze({ allowed: true });
}

function disallowed(reason: string): AdventureActionAvailability {
  return Object.freeze({ allowed: false, reason });
}

/**
 * Predicts, for the exact current state, whether each command would be
 * accepted and why not if it would not. This is a read-only presentation
 * projection computed by the same authoritative domain code that will
 * actually validate the command when dispatched — it does not change what
 * is authoritative, it only lets a client (Godot) disable/explain controls
 * without re-deriving any rule itself. Reason codes are a small, stable,
 * presentation-facing vocabulary distinct from the internal ADVENTURE_*
 * error codes thrown by the reducer/lifecycle.
 */
function computeAdventureActions(
  state: AdventureGameState,
  rules: CompiledRuleset,
  level: number,
): AdventureActions {
  const { run } = state;
  const isPrepare = run.phase === "PREPARE";
  const wrongPhase = disallowed("WRONG_PHASE");

  const refreshShop = !isPrepare
    ? wrongPhase
    : run.shopLocked
      ? disallowed("SHOP_LOCKED")
      : run.freeRefreshes > 0 || run.gold >= rules.shop.refreshCost
        ? allowed()
        : disallowed("NOT_ENOUGH_GOLD");

  const buyXp = !isPrepare
    ? wrongPhase
    : level >= rules.progression.maxLevel
      ? disallowed("MAX_LEVEL")
      : run.gold >= rules.progression.xpPurchaseCost
        ? allowed()
        : disallowed("NOT_ENOUGH_GOLD");

  const hasBenchSpace = run.bench.some((hero) => hero === null);
  const startRound = !isPrepare
    ? wrongPhase
    : run.rewardHeroes.length > 0
      ? disallowed("PENDING_HERO_REWARD")
      : deployedHeroCount(run) === 0
        ? disallowed("EMPTY_BOARD")
        : allowed();

  const claimRewardHero = !isPrepare
    ? wrongPhase
    : run.rewardHeroes.length === 0
      ? disallowed("NO_PENDING_HERO_REWARD")
      : hasBenchSpace
        ? allowed()
        : disallowed("BENCH_FULL");

  const rosterAction = isPrepare ? allowed() : wrongPhase;

  const buyShopSlots = run.shop.map((slot) => {
    if (!isPrepare) return wrongPhase;
    if (slot === null) return disallowed("SLOT_EMPTY");
    if (run.gold < slot.cost) return disallowed("NOT_ENOUGH_GOLD");
    if (!hasBenchSpace) return disallowed("BENCH_FULL");
    return allowed();
  });

  return Object.freeze({
    refreshShop,
    lockShop: isPrepare ? allowed() : wrongPhase,
    buyXp,
    moveHero: rosterAction,
    sellHero: rosterAction,
    equipItem: rosterAction,
    unequipItem: rosterAction,
    claimRewardHero,
    startRound,
    resolveCombat: run.phase === "COMBAT" ? allowed() : wrongPhase,
    ackPlaybackComplete: run.phase === "PLAYBACK" ? allowed() : wrongPhase,
    claimRoundReward: run.phase === "REWARD" ? allowed() : wrongPhase,
    buyShopSlots: Object.freeze(buyShopSlots),
  });
}

function traitBreakpoints(value: unknown): readonly number[] {
  if (typeof value !== "object" || value === null) return [];
  const breakpoints = (value as { readonly breakpoints?: unknown }).breakpoints;
  if (!Array.isArray(breakpoints)) return [];
  return Object.freeze(breakpoints.flatMap((entry) => {
    if (typeof entry !== "object" || entry === null) return [];
    const count = (entry as { readonly count?: unknown }).count;
    return typeof count === "number" && Number.isSafeInteger(count) && count > 0 ? [count] : [];
  }).sort((left, right) => left - right));
}

function traitViews(state: AdventureGameState, content: CompiledContentBundle): readonly AdventureTraitView[] {
  const distinctHeroes = new Map<string, Set<string>>();
  for (const instance of state.run.board) {
    if (instance === null) continue;
    const hero = content.heroesById.get(instance.heroId);
    if (hero === undefined) continue;
    for (const traitId of [hero.species_trait_id, hero.class_trait_id]) {
      const heroes = distinctHeroes.get(traitId) ?? new Set<string>();
      heroes.add(hero.id);
      distinctHeroes.set(traitId, heroes);
    }
  }

  const views: AdventureTraitView[] = [];
  for (const [traitId, heroes] of [...distinctHeroes.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const breakpoints = traitBreakpoints(content.traitsById.get(traitId));
    const activeBreakpoint = [...breakpoints].filter((count) => count <= heroes.size).at(-1) ?? 0;
    const nextBreakpoint = breakpoints.find((count) => count > heroes.size);
    views.push(Object.freeze({
      traitId,
      count: heroes.size,
      activeBreakpoint,
      ...(nextBreakpoint === undefined ? {} : { nextBreakpoint }),
    }));
  }
  return Object.freeze(views);
}

export function buildAdventureView(
  state: AdventureGameState,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): AdventureView {
  assertAdventureGameState(state, content, rules);
  const progression = progressionState(rules, state.run.level, state.run.experience);
  return Object.freeze({
    id: state.run.id,
    revision: state.run.revision,
    phase: state.run.phase,
    rulesetVersion: state.run.rulesetVersion,
    contentVersion: state.run.contentVersion,
    round: state.run.round,
    gold: state.run.gold,
    health: state.run.health,
    level: progression.level,
    experience: progression.experience,
    experienceToNext: progression.xpToNext,
    boardCap: progression.boardCap,
    shopOdds: shopOddsAtLevel(rules, progression.level),
    shop: state.run.shop,
    shopLocked: state.run.shopLocked,
    freeRefreshes: state.run.freeRefreshes,
    board: state.run.board,
    bench: state.run.bench,
    items: state.run.items,
    rewardHeroes: state.run.rewardHeroes,
    traits: traitViews(state, content),
    actions: computeAdventureActions(state, rules, progression.level),
    // The reward plan is computed as soon as combat resolves (during
    // PLAYBACK), but must not be visible to the client until the player has
    // acknowledged the combat presentation and the run has actually
    // advanced to REWARD — otherwise the reward would spoil before the
    // fight replay finishes.
    ...(state.pendingReward === undefined || state.run.phase !== "REWARD" ? {} : { pendingReward: state.pendingReward }),
    ...(state.lastCombat === undefined ? {} : { lastCombat: state.lastCombat }),
  });
}
