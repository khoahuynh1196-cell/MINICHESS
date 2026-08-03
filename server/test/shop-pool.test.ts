import { describe, expect, it } from "vitest";

const runSeed = "000102030405060708090a0b0c0d0e0f";

function contentWithHeroes(heroes: readonly { id: string; cost: number; rarity: 1 | 2 | 3 | 4 | 5; is_unique_hero: boolean }[]) {
  return { heroesById: new Map(heroes.map((hero) => [hero.id, hero])) };
}

describe("deterministic shop pool", () => {
  it("excludes content-marked Unique heroes and produces five slots", async () => {
    const shopPool = await import("../src/application/shop-pool.js") as {
      createShopPool(content: unknown, seed: string): unknown;
      rollShop(pool: unknown, level: number, stream: string): readonly { heroId: string; cost: number }[];
    };
    const pool = shopPool.createShopPool(contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H99", cost: 1, rarity: 1, is_unique_hero: true },
    ]), runSeed);

    const slots = shopPool.rollShop(pool, 1, "shop:1:0");

    expect(slots).toHaveLength(5);
    expect(slots.every((slot) => slot.heroId === "H01" && slot.cost === 1)).toBe(true);
  });

  it("keeps a bought copy out of the pool and restores it when sold", async () => {
    const shopPool = await import("../src/application/shop-pool.js") as {
      createShopPool(content: unknown, seed: string): { heroes: Record<string, { remainingCopies: number }> };
      rollShop(pool: unknown, level: number, stream: string): readonly { heroId: string; cost: number }[];
      returnShopSlots(pool: unknown, slots: readonly { heroId: string; cost: number }[]): void;
      returnHeroToShopPool(pool: unknown, heroId: string): void;
    };
    const pool = shopPool.createShopPool(contentWithHeroes([{ id: "H01", cost: 1, rarity: 1, is_unique_hero: false }]), runSeed);
    const startingCopies = pool.heroes.H01!.remainingCopies;
    const slots = shopPool.rollShop(pool, 1, "shop:1:0");

    shopPool.returnShopSlots(pool, slots.slice(1));

    expect(pool.heroes.H01!.remainingCopies).toBe(startingCopies - 1);
    shopPool.returnHeroToShopPool(pool, "H01");
    expect(pool.heroes.H01!.remainingCopies).toBe(startingCopies);
  });

  it("uses the same seeded stream for repeatable level-aware rolls", async () => {
    const shopPool = await import("../src/application/shop-pool.js") as {
      createShopPool(content: unknown, seed: string): unknown;
      rollShop(pool: unknown, level: number, stream: string): readonly { heroId: string; cost: number }[];
    };
    const content = contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H02", cost: 2, rarity: 2, is_unique_hero: false },
      { id: "H03", cost: 3, rarity: 3, is_unique_hero: false },
    ]);
    const first = shopPool.createShopPool(content, runSeed);
    const second = shopPool.createShopPool(content, runSeed);

    expect(shopPool.rollShop(first, 3, "shop:2:4")).toEqual(shopPool.rollShop(second, 3, "shop:2:4"));
  });

  it("makes five-cost heroes available at the supported high tier", async () => {
    const shopPool = await import("../src/application/shop-pool.js") as {
      createShopPool(content: unknown, seed: string): unknown;
      rollShop(pool: unknown, level: number, stream: string): readonly { heroId: string; cost: number }[];
    };
    const content = contentWithHeroes([
      { id: "H01", cost: 1, rarity: 1, is_unique_hero: false },
      { id: "H05", cost: 5, rarity: 5, is_unique_hero: false },
    ]);
    const levelOne = shopPool.rollShop(shopPool.createShopPool(content, runSeed), 1, "shop:1:0");
    const levelTenSlots = Array.from({ length: 20 }, (_, refresh) => shopPool.rollShop(shopPool.createShopPool(content, runSeed), 10, `shop:1:${refresh}`)).flat();

    expect(levelOne.every((slot) => slot.cost === 1)).toBe(true);
    expect(levelTenSlots.some((slot) => slot.cost === 5)).toBe(true);
  });
});
