import { createHmac } from "node:crypto";
import type { CompiledContentBundle } from "@auto-battler/game-core";

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

const RUN_SEED_HEX = /^[0-9a-f]{32,}$/i;
const COPIES_BY_RARITY: Readonly<Record<ShopPoolHero["rarity"], number>> = { 1: 29, 2: 22, 3: 18, 4: 12, 5: 10 };
const TIER_ODDS_BY_LEVEL: readonly (readonly number[])[] = [
  [],
  [100, 0, 0, 0, 0],
  [70, 30, 0, 0, 0],
  [55, 35, 10, 0, 0],
  [45, 35, 18, 2, 0],
  [30, 35, 25, 9, 1],
  [19, 30, 35, 15, 1],
  [15, 20, 35, 25, 5],
  [10, 15, 30, 30, 15],
  [5, 10, 20, 35, 30],
  [1, 2, 12, 45, 40],
];

export interface ShopTierOdds {
  readonly tier1: number;
  readonly tier2: number;
  readonly tier3: number;
  readonly tier4: number;
  readonly tier5: number;
}

function assertRunSeed(runSeed: string): void {
  if (!RUN_SEED_HEX.test(runSeed) || runSeed.length % 2 !== 0) throw new Error("GAME_RULE_VIOLATION");
}

function shopEligibleHero(hero: { readonly is_unique_hero: boolean }): boolean {
  return !hero.is_unique_hero;
}

function randomBelow(pool: ShopPool, stream: string, counter: number, upperExclusive: number): number {
  const digest = createHmac("sha256", Buffer.from(pool.runSeed, "hex")).update(`${stream}:${counter}`).digest();
  return Number(digest.readBigUInt64BE(0) % BigInt(upperExclusive));
}

function oddsForLevel(level: number): readonly number[] {
  if (!Number.isInteger(level) || level < 1) throw new Error("GAME_RULE_VIOLATION");
  return TIER_ODDS_BY_LEVEL[Math.min(level, TIER_ODDS_BY_LEVEL.length - 1)]!;
}

/** Public, server-derived tier probabilities for the current player level. */
export function shopOddsForLevel(level: number): ShopTierOdds {
  const odds = oddsForLevel(level);
  return Object.freeze({ tier1: odds[0]!, tier2: odds[1]!, tier3: odds[2]!, tier4: odds[3]!, tier5: odds[4]! });
}

function chooseWeightedIndex(weights: readonly number[], random: number): number {
  let remaining = random;
  for (let index = 0; index < weights.length; index += 1) {
    remaining -= weights[index]!;
    if (remaining < 0) return index;
  }
  return weights.length - 1;
}

function availableHeroesForRarity(pool: ShopPool, rarity: number): readonly [string, ShopPoolHero][] {
  return Object.entries(pool.heroes)
    .filter(([, hero]) => hero.rarity === rarity && hero.remainingCopies > 0)
    .sort(([left], [right]) => left.localeCompare(right));
}

function selectRarity(pool: ShopPool, level: number, stream: string, counter: number): number {
  const odds = oddsForLevel(level);
  const availableRarities = odds.map((weight, index) => weight > 0 && availableHeroesForRarity(pool, index + 1).length > 0);
  const weights = odds.map((weight, index) => availableRarities[index] ? weight : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total === 0) throw new Error("GAME_RULE_VIOLATION");
  return chooseWeightedIndex(weights, randomBelow(pool, stream, counter, total)) + 1;
}

export function createShopPool(content: Pick<CompiledContentBundle, "heroesById">, runSeed: string): ShopPool {
  assertRunSeed(runSeed);
  const heroes = [...content.heroesById.values()]
    .filter(shopEligibleHero)
    .sort((left, right) => left.id.localeCompare(right.id));
  if (heroes.length === 0 || heroes.some((hero) => !Number.isInteger(hero.cost) || hero.cost < 1 || hero.cost > 5 || !Number.isInteger(hero.rarity) || hero.rarity < 1 || hero.rarity > 5)) {
    throw new Error("GAME_RULE_VIOLATION");
  }
  return {
    runSeed,
    heroes: Object.fromEntries(heroes.map((hero) => [hero.id, {
      cost: hero.cost,
      rarity: hero.rarity as ShopPoolHero["rarity"],
      totalCopies: COPIES_BY_RARITY[hero.rarity as ShopPoolHero["rarity"]],
      remainingCopies: COPIES_BY_RARITY[hero.rarity as ShopPoolHero["rarity"]],
    }])),
  };
}

export function cloneShopPool(pool: ShopPool): ShopPool {
  assertRunSeed(pool.runSeed);
  return {
    runSeed: pool.runSeed,
    heroes: Object.fromEntries(Object.entries(pool.heroes).map(([heroId, hero]) => [heroId, { ...hero }])),
  };
}

/** Draws five slots and reserves their copies until they are bought or rerolled. */
export function rollShop(pool: ShopPool, level: number, stream: string): ShopSlot[] {
  if (stream.length === 0) throw new Error("GAME_RULE_VIOLATION");
  const slots: ShopSlot[] = [];
  for (let slotIndex = 0; slotIndex < 5; slotIndex += 1) {
    const rarity = selectRarity(pool, level, stream, slotIndex * 2);
    const candidates = availableHeroesForRarity(pool, rarity);
    const totalCopies = candidates.reduce((sum, [, hero]) => sum + hero.remainingCopies, 0);
    const selected = randomBelow(pool, stream, slotIndex * 2 + 1, totalCopies);
    let offset = selected;
    const [heroId, hero] = candidates.find(([, candidate]) => {
      offset -= candidate.remainingCopies;
      return offset < 0;
    })!;
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
