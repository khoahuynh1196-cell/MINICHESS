import { createHmac } from "node:crypto";
import type { CompiledContentBundle, CompiledRuleset } from "@auto-battler/game-core";

export interface ShopSlot {
  readonly heroId: string;
  readonly cost: number;
}

export interface ShopPoolHero {
  readonly cost: number;
  readonly rarity: 1 | 2 | 3 | 4 | 5;
  readonly totalCopies: number;
  remainingCopies: number;
}

/** Authoritative per-run pool state. It is serialized with the run. */
export interface ShopPool {
  readonly runSeed: string;
  readonly heroes: Record<string, ShopPoolHero>;
}

export interface ShopTierOdds {
  readonly tier1: number;
  readonly tier2: number;
  readonly tier3: number;
  readonly tier4: number;
  readonly tier5: number;
}

const RUN_SEED_HEX = /^[0-9a-f]{32,}$/i;

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertRunSeed(runSeed: string): void {
  if (!RUN_SEED_HEX.test(runSeed) || runSeed.length % 2 !== 0) throw new Error("GAME_RULE_VIOLATION");
}

function shopEligibleHero(hero: { readonly is_unique_hero: boolean }): boolean {
  return !hero.is_unique_hero;
}

function randomBelow(pool: ShopPool, stream: string, counter: number, upperExclusive: number): number {
  if (!Number.isSafeInteger(upperExclusive) || upperExclusive < 1) throw new Error("GAME_RULE_VIOLATION");
  const digest = createHmac("sha256", Buffer.from(pool.runSeed, "hex")).update(`${stream}:${counter}`).digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(upperExclusive));
}

function oddsForLevel(level: number, rules: CompiledRuleset["shop"]): readonly number[] {
  if (!Number.isSafeInteger(level)) throw new Error("GAME_RULE_VIOLATION");
  const odds = rules.oddsByLevel[level];
  if (odds === undefined) throw new Error("GAME_RULE_VIOLATION");
  return odds;
}

/** Public, server-derived tier probabilities for the current player level. */
export function shopOddsForLevel(level: number, rules: CompiledRuleset["shop"]): ShopTierOdds {
  const odds = oddsForLevel(level, rules);
  return Object.freeze({ tier1: odds[0]!, tier2: odds[1]!, tier3: odds[2]!, tier4: odds[3]!, tier5: odds[4]! });
}

function chooseWeightedIndex(weights: readonly number[], random: number): number {
  let remaining = random;
  for (let index = 0; index < weights.length; index += 1) {
    remaining -= weights[index]!;
    if (remaining < 0) return index;
  }
  throw new Error("GAME_RULE_VIOLATION");
}

function availableHeroesForRarity(pool: ShopPool, rarity: number): readonly [string, ShopPoolHero][] {
  return Object.entries(pool.heroes)
    .filter(([, hero]) => hero.rarity === rarity && hero.remainingCopies > 0)
    .sort(([left], [right]) => compareStrings(left, right));
}

function selectRarity(pool: ShopPool, level: number, stream: string, counter: number, rules: CompiledRuleset["shop"]): number {
  const odds = oddsForLevel(level, rules);
  const availableRarities = odds.map((weight, index) => weight > 0 && availableHeroesForRarity(pool, index + 1).length > 0);
  const weights = odds.map((weight, index) => availableRarities[index] ? weight : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) throw new Error("GAME_RULE_VIOLATION");
  return chooseWeightedIndex(weights, randomBelow(pool, stream, counter, total)) + 1;
}

export function createShopPool(
  content: Pick<CompiledContentBundle, "heroesById">,
  runSeed: string,
  rules: CompiledRuleset["shop"],
): ShopPool {
  assertRunSeed(runSeed);
  const heroes = [...content.heroesById.values()]
    .filter(shopEligibleHero)
    .sort((left, right) => compareStrings(left.id, right.id));
  if (heroes.length === 0 || heroes.some((hero) => !Number.isSafeInteger(hero.cost) || hero.cost < 1 || hero.cost > 5
    || !Number.isSafeInteger(hero.rarity) || hero.rarity < 1 || hero.rarity > 5)) {
    throw new Error("GAME_RULE_VIOLATION");
  }
  return {
    runSeed,
    heroes: Object.fromEntries(heroes.map((hero) => {
      const rarity = hero.rarity as ShopPoolHero["rarity"];
      const totalCopies = rules.copiesByRarity[rarity];
      if (!Number.isSafeInteger(totalCopies) || totalCopies < 1) throw new Error("GAME_RULE_VIOLATION");
      return [hero.id, {
        cost: hero.cost,
        rarity,
        totalCopies,
        remainingCopies: totalCopies,
      }];
    })),
  };
}

export function cloneShopPool(pool: ShopPool): ShopPool {
  assertRunSeed(pool.runSeed);
  return {
    runSeed: pool.runSeed,
    heroes: Object.fromEntries(Object.entries(pool.heroes).map(([heroId, hero]) => [heroId, { ...hero }])),
  };
}

/** Draws and reserves the configured number of slots until bought or rerolled. */
export function rollShop(
  pool: ShopPool,
  level: number,
  stream: string,
  rules: CompiledRuleset["shop"],
): ShopSlot[] {
  if (stream.length === 0) throw new Error("GAME_RULE_VIOLATION");
  const slots: ShopSlot[] = [];
  for (let slotIndex = 0; slotIndex < rules.slotCount; slotIndex += 1) {
    const rarity = selectRarity(pool, level, stream, slotIndex * 2, rules);
    const candidates = availableHeroesForRarity(pool, rarity);
    const totalCopies = candidates.reduce((sum, [, hero]) => sum + hero.remainingCopies, 0);
    const selected = randomBelow(pool, stream, slotIndex * 2 + 1, totalCopies);
    let offset = selected;
    const match = candidates.find(([, candidate]) => {
      offset -= candidate.remainingCopies;
      return offset < 0;
    });
    if (match === undefined) throw new Error("GAME_RULE_VIOLATION");
    const [heroId, hero] = match;
    hero.remainingCopies -= 1;
    slots.push(Object.freeze({ heroId, cost: hero.cost }));
  }
  return Object.freeze(slots) as ShopSlot[];
}

export function returnHeroToShopPool(pool: ShopPool, heroId: string, copies = 1): void {
  const hero = pool.heroes[heroId];
  if (hero === undefined || !Number.isSafeInteger(copies) || copies < 1 || hero.remainingCopies + copies > hero.totalCopies) throw new Error("GAME_RULE_VIOLATION");
  hero.remainingCopies += copies;
}

/** Reserves copies granted outside a shop roll, such as a selected hero reward. */
export function reserveHeroFromShopPool(pool: ShopPool, heroId: string, copies = 1): void {
  const hero = pool.heroes[heroId];
  if (hero === undefined || !Number.isSafeInteger(copies) || copies < 1 || hero.remainingCopies < copies) throw new Error("GAME_RULE_VIOLATION");
  hero.remainingCopies -= copies;
}

/** Returns all unbought slots to the pool before a refresh replaces them. */
export function returnShopSlots(pool: ShopPool, slots: readonly (ShopSlot | null)[]): void {
  for (const slot of slots) if (slot !== null) returnHeroToShopPool(pool, slot.heroId);
}
