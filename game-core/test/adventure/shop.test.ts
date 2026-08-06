import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adventureShopRemainingCopies,
  buyAdventureShopSlot,
  compileContentBundle,
  compileRuleset,
  createAdventureShopPool,
  refreshAdventureShop,
  reserveAdventureHeroCopies,
  returnAdventureHeroCopies,
  returnAdventureShopSlots,
  rollAdventureShop,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));
const seed = "adventure-shop-seed-001";

describe("immutable Adventure shop", () => {
  it("rolls five deterministic slots without mutating the source pool", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    const first = rollAdventureShop(initial, rules, 3, "round:1:refresh:0");
    const second = rollAdventureShop(initial, rules, 3, "round:1:refresh:0");

    expect(first.slots).toHaveLength(5);
    expect(first).toEqual(second);
    expect(first.pool).not.toBe(initial);
    for (const slot of first.slots) {
      expect(content.heroesById.get(slot.heroId)?.is_unique_hero).toBe(false);
      expect(adventureShopRemainingCopies(first.pool, slot.heroId))
        .toBeLessThan(adventureShopRemainingCopies(initial, slot.heroId));
    }
  });

  it("returns every unbought slot and restores the initial pool exactly", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    const rolled = rollAdventureShop(initial, rules, 4, "round:1:refresh:0");
    const restored = returnAdventureShopSlots(rolled.pool, rolled.slots);

    expect(restored).toEqual(initial);
  });

  it("keeps the purchased copy reserved while returning the other slots", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    const rolled = rollAdventureShop(initial, rules, 4, "round:1:refresh:0");
    const purchase = buyAdventureShopSlot(rolled.slots, 2);
    const afterReturn = returnAdventureShopSlots(rolled.pool, purchase.slots);

    expect(adventureShopRemainingCopies(afterReturn, purchase.purchased.heroId))
      .toBe(adventureShopRemainingCopies(initial, purchase.purchased.heroId) - 1);
  });

  it("refreshes by returning current reservations before making a new roll", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    const first = rollAdventureShop(initial, rules, 5, "round:1:refresh:0");
    const refreshed = refreshAdventureShop(first.pool, first.slots, rules, 5, "round:1:refresh:1");
    const direct = rollAdventureShop(initial, rules, 5, "round:1:refresh:1");

    expect(refreshed).toEqual(direct);
  });

  it("reserves and returns non-shop hero rewards without mutating prior states", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    const heroId = firstHeroId(initial);
    const reserved = reserveAdventureHeroCopies(initial, heroId, 1);
    const returned = returnAdventureHeroCopies(reserved, heroId, 1);

    expect(adventureShopRemainingCopies(reserved, heroId))
      .toBe(adventureShopRemainingCopies(initial, heroId) - 1);
    expect(returned).toEqual(initial);
  });

  it("rejects empty streams, empty slots, invalid indices, and copy overflow", () => {
    const initial = createAdventureShopPool(content, rules, seed);
    expect(() => rollAdventureShop(initial, rules, 3, "")).toThrow("Adventure shop stream must not be empty");
    expect(() => buyAdventureShopSlot([null], 0)).toThrow("Adventure shop slot is empty");
    expect(() => buyAdventureShopSlot([], 0)).toThrow("Invalid Adventure shop slot index");
    expect(() => returnAdventureHeroCopies(initial, firstHeroId(initial), 1))
      .toThrow("Adventure shop copy mutation is outside");
  });
});

function firstHeroId(pool: ReturnType<typeof createAdventureShopPool>): string {
  const heroId = Object.keys(pool.entries).sort()[0];
  if (heroId === undefined) throw new Error("Test pool is empty");
  return heroId;
}
