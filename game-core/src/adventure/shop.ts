import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset, HeroRarity, ShopOdds } from "../rules/types.js";
import { createSeededRng } from "../simulation/seeded-rng.js";
import type { AdventureShopSlot } from "./types.js";

export interface AdventureShopPoolEntry {
  readonly heroId: string;
  readonly cost: number;
  readonly rarity: HeroRarity;
  readonly totalCopies: number;
  readonly remainingCopies: number;
}

export interface AdventureShopPool {
  readonly seed: string;
  readonly entries: Readonly<Record<string, AdventureShopPoolEntry>>;
}

export interface AdventureShopRoll {
  readonly pool: AdventureShopPool;
  readonly slots: readonly AdventureShopSlot[];
}

type ShopRulesContract = Pick<CompiledRuleset, "shop" | "progression">;

function freezeEntry(entry: AdventureShopPoolEntry): AdventureShopPoolEntry {
  return Object.freeze({ ...entry });
}

function freezePool(seed: string, entries: Readonly<Record<string, AdventureShopPoolEntry>>): AdventureShopPool {
  return Object.freeze({
    seed,
    entries: Object.freeze(Object.fromEntries(Object.entries(entries)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([heroId, entry]) => [heroId, freezeEntry(entry)]))),
  });
}

function mutableEntries(pool: AdventureShopPool): Record<string, AdventureShopPoolEntry> {
  return Object.fromEntries(Object.entries(pool.entries).map(([heroId, entry]) => [heroId, { ...entry }]));
}

function oddsAtLevel(rules: ShopRulesContract, level: number): ShopOdds {
  const odds = rules.shop.oddsByLevel[level];
  if (odds === undefined) throw new Error(`Missing shop odds for level: ${level}`);
  return odds;
}

export function createAdventureShopPool(
  content: Pick<CompiledContentBundle, "heroesById">,
  rules: ShopRulesContract,
  seed: string,
): AdventureShopPool {
  if (seed.length === 0) throw new Error("Adventure shop seed must not be empty");
  const entries: Record<string, AdventureShopPoolEntry> = {};
  for (const hero of [...content.heroesById.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    if (hero.is_unique_hero) continue;
    const totalCopies = rules.shop.copiesByRarity[hero.rarity];
    if (totalCopies === undefined || totalCopies <= 0) throw new Error(`No pool copies configured for hero ${hero.id}`);
    if (!Number.isSafeInteger(hero.cost) || hero.cost < 1 || hero.cost > 5) throw new Error(`Invalid shop cost for hero ${hero.id}`);
    entries[hero.id] = {
      heroId: hero.id,
      cost: hero.cost,
      rarity: hero.rarity,
      totalCopies,
      remainingCopies: totalCopies,
    };
  }
  if (Object.keys(entries).length === 0) throw new Error("Adventure shop pool requires at least one hero");
  return freezePool(seed, entries);
}

function availableEntries(entries: Readonly<Record<string, AdventureShopPoolEntry>>, rarity: HeroRarity): AdventureShopPoolEntry[] {
  return Object.values(entries)
    .filter((entry) => entry.rarity === rarity && entry.remainingCopies > 0)
    .sort((left, right) => left.heroId.localeCompare(right.heroId));
}

function weightedIndex(weights: readonly number[], value: number): number {
  let remaining = value;
  for (let index = 0; index < weights.length; index += 1) {
    remaining -= weights[index]!;
    if (remaining < 0) return index;
  }
  throw new Error("Weighted selection exceeded its total");
}

function selectRarity(
  entries: Readonly<Record<string, AdventureShopPoolEntry>>,
  odds: ShopOdds,
  random: ReturnType<typeof createSeededRng>,
): HeroRarity {
  const weights = odds.map((weight, index) =>
    availableEntries(entries, (index + 1) as HeroRarity).length > 0 ? weight : 0);
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  if (total <= 0) throw new Error("Adventure shop pool has no rollable heroes");
  return (weightedIndex(weights, random.nextInt(total)) + 1) as HeroRarity;
}

function selectHero(
  entries: Readonly<Record<string, AdventureShopPoolEntry>>,
  rarity: HeroRarity,
  random: ReturnType<typeof createSeededRng>,
): AdventureShopPoolEntry {
  const candidates = availableEntries(entries, rarity);
  const totalCopies = candidates.reduce((sum, entry) => sum + entry.remainingCopies, 0);
  if (totalCopies <= 0) throw new Error(`Adventure shop rarity ${rarity} has no copies`);
  let selected = random.nextInt(totalCopies);
  for (const candidate of candidates) {
    selected -= candidate.remainingCopies;
    if (selected < 0) return candidate;
  }
  throw new Error("Adventure shop hero selection failed");
}

export function rollAdventureShop(
  pool: AdventureShopPool,
  rules: ShopRulesContract,
  level: number,
  stream: string,
): AdventureShopRoll {
  if (stream.length === 0) throw new Error("Adventure shop stream must not be empty");
  const odds = oddsAtLevel(rules, level);
  const entries = mutableEntries(pool);
  const random = createSeededRng(`${pool.seed}:${stream}`);
  const slots: AdventureShopSlot[] = [];
  for (let index = 0; index < rules.shop.slotCount; index += 1) {
    const rarity = selectRarity(entries, odds, random);
    const selected = selectHero(entries, rarity, random);
    entries[selected.heroId] = { ...selected, remainingCopies: selected.remainingCopies - 1 };
    slots.push(Object.freeze({ heroId: selected.heroId, cost: selected.cost, rarity: selected.rarity }));
  }
  return Object.freeze({ pool: freezePool(pool.seed, entries), slots: Object.freeze(slots) });
}

function adjustCopies(pool: AdventureShopPool, heroId: string, delta: number): AdventureShopPool {
  if (!Number.isSafeInteger(delta) || delta === 0) throw new Error("Shop copy delta must be a non-zero safe integer");
  const current = pool.entries[heroId];
  if (current === undefined) throw new Error(`Adventure shop hero not found: ${heroId}`);
  const remainingCopies = current.remainingCopies + delta;
  if (remainingCopies < 0 || remainingCopies > current.totalCopies) {
    throw new Error(`Adventure shop copy mutation is outside 0..${current.totalCopies} for ${heroId}`);
  }
  return freezePool(pool.seed, { ...pool.entries, [heroId]: { ...current, remainingCopies } });
}

export function reserveAdventureHeroCopies(pool: AdventureShopPool, heroId: string, copies = 1): AdventureShopPool {
  if (!Number.isSafeInteger(copies) || copies < 1) throw new Error("Reserved copies must be a positive safe integer");
  return adjustCopies(pool, heroId, -copies);
}

export function returnAdventureHeroCopies(pool: AdventureShopPool, heroId: string, copies = 1): AdventureShopPool {
  if (!Number.isSafeInteger(copies) || copies < 1) throw new Error("Returned copies must be a positive safe integer");
  return adjustCopies(pool, heroId, copies);
}

export function returnAdventureShopSlots(
  pool: AdventureShopPool,
  slots: readonly (AdventureShopSlot | null)[],
): AdventureShopPool {
  return slots.reduce((current, slot) =>
    slot === null ? current : returnAdventureHeroCopies(current, slot.heroId), pool);
}

export function buyAdventureShopSlot(
  slots: readonly (AdventureShopSlot | null)[],
  index: number,
): { readonly purchased: AdventureShopSlot; readonly slots: readonly (AdventureShopSlot | null)[] } {
  if (!Number.isSafeInteger(index) || index < 0 || index >= slots.length) throw new Error("Invalid Adventure shop slot index");
  const purchased = slots[index];
  if (purchased === null || purchased === undefined) throw new Error("Adventure shop slot is empty");
  return Object.freeze({
    purchased,
    slots: Object.freeze(slots.map((slot, slotIndex) => slotIndex === index ? null : slot)),
  });
}

export function refreshAdventureShop(
  pool: AdventureShopPool,
  currentSlots: readonly (AdventureShopSlot | null)[],
  rules: ShopRulesContract,
  level: number,
  stream: string,
): AdventureShopRoll {
  const returnedPool = returnAdventureShopSlots(pool, currentSlots);
  return rollAdventureShop(returnedPool, rules, level, stream);
}

export function adventureShopRemainingCopies(pool: AdventureShopPool, heroId: string): number {
  const entry = pool.entries[heroId];
  if (entry === undefined) throw new Error(`Adventure shop hero not found: ${heroId}`);
  return entry.remainingCopies;
}
