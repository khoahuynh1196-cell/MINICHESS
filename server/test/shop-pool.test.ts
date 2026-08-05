import { describe, expect, it } from "vitest";
import { createShopPool, rollShop, returnHeroToShopPool, returnShopSlots } from "../src/application/shop-pool.js";
import { productionRules } from "./support/production-rules.js";

const runSeed = "000102030405060708090a0b0c0d0e0f";

function contentWithHeroes(heroes: readonly { id: string; cost: number; rarity: 1 | 2 | 3 | 4 | 5; is_unique_hero: boolean }[]) {
  return { heroesById: new Map(heroes.map((hero) => [hero.id, hero])) } as any;
}

describe("deterministic shop pool", () => {
  it("excludes content-marked Unique heroes and produces the configured slots", () => {
    const pool = createShopPool(contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H99", cost: 1, rarity: 1, is_unique_hero: true },
    ]), runSeed, productionRules.shop);

    const slots = rollShop(pool, 3, "shop:1:0", productionRules.shop);

    expect(slots).toHaveLength(productionRules.shop.slotCount);
    expect(slots.every((slot) => slot.heroId === "H01" && slot.cost === 1)).toBe(true);
  });

  it("keeps a bought copy out of the pool and restores it when sold", () => {
    const pool = createShopPool(contentWithHeroes([{ id: "H01", cost: 1, rarity: 1, is_unique_hero: false }]), runSeed, productionRules.shop);
    const startingCopies = pool.heroes.H01!.remainingCopies;
    const slots = rollShop(pool, 3, "shop:1:0", productionRules.shop);

    returnShopSlots(pool, slots.slice(1));

    expect(pool.heroes.H01!.remainingCopies).toBe(startingCopies - 1);
    returnHeroToShopPool(pool, "H01");
    expect(pool.heroes.H01!.remainingCopies).toBe(startingCopies);
  });

  it("uses the same seeded stream for repeatable level-aware rolls", () => {
    const content = contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H02", cost: 2, rarity: 2, is_unique_hero: false },
      { id: "H03", cost: 3, rarity: 3, is_unique_hero: false },
    ]);
    const first = createShopPool(content, runSeed, productionRules.shop);
    const second = createShopPool(content, runSeed, productionRules.shop);

    expect(rollShop(first, 3, "shop:2:4", productionRules.shop))
      .toEqual(rollShop(second, 3, "shop:2:4", productionRules.shop));
  });

  it("makes five-cost heroes available at the supported high tier", () => {
    const content = contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H05", cost: 5, rarity: 5, is_unique_hero: false },
    ]);
    const levelThree = rollShop(createShopPool(content, runSeed, productionRules.shop), 3, "shop:1:0", productionRules.shop);
    const levelNineSlots = Array.from({ length: 20 }, (_, refresh) =>
      rollShop(createShopPool(content, runSeed, productionRules.shop), 9, `shop:1:${refresh}`, productionRules.shop)).flat();

    expect(levelThree.every((slot) => slot.cost === 1)).toBe(true);
    expect(levelNineSlots.some((slot) => slot.cost === 5)).toBe(true);
  });
});
