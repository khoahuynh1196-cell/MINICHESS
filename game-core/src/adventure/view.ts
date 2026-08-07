import type { CompiledContentBundle } from "../content/types.js";
import { progressionState, shopOddsAtLevel } from "../rules/progression.js";
import type { CompiledRuleset, ShopOdds } from "../rules/types.js";
import type { AdventureRewardPlan } from "./rewards.js";
import type { AdventureCombatSummary, AdventureGameState } from "./state.js";
import type {
  AdventureHeroInstance,
  AdventureItemInstance,
  AdventurePhase,
  AdventureShopSlot,
} from "./types.js";
import { assertAdventureGameState } from "./validation.js";

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
  readonly pendingReward?: AdventureRewardPlan;
  readonly lastCombat?: AdventureCombatSummary;
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
    ...(state.pendingReward === undefined ? {} : { pendingReward: state.pendingReward }),
    ...(state.lastCombat === undefined ? {} : { lastCombat: state.lastCombat }),
  });
}
