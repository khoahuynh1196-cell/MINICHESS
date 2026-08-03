import { describe, expect, it } from "vitest";

describe("run Unique selection", () => {
  it("uses the private run seed and a stable item-ID ordering", async () => {
    const selection = await import("../src/application/unique-selection.js").catch(() => undefined) as undefined | {
      selectRunUniqueId(runSeed: string, uniqueItemIds: readonly string[]): string;
    };
    expect(selection).toBeDefined();
    if (selection === undefined) return;

    const selected = selection.selectRunUniqueId(
      "000102030405060708090a0b0c0d0e0f",
      ["U06", "U04", "U02", "U05", "U03", "U01"],
    );

    expect(selected).toBe("U01");
  });

  it("rejects malformed seeds and an empty candidate set", async () => {
    const selection = await import("../src/application/unique-selection.js") as {
      selectRunUniqueId(runSeed: string, uniqueItemIds: readonly string[]): string;
    };

    expect(() => selection.selectRunUniqueId("not-a-seed", ["U01"])).toThrow("GAME_RULE_VIOLATION");
    expect(() => selection.selectRunUniqueId("000102030405060708090a0b0c0d0e0f", [])).toThrow("GAME_RULE_VIOLATION");
  });

  it("keeps the six Unique outcomes within five percent of uniform over 10,000 seeds", async () => {
    const selection = await import("../src/application/unique-selection.js") as {
      selectRunUniqueId(runSeed: string, uniqueItemIds: readonly string[]): string;
    };
    const ids = ["U01", "U02", "U03", "U04", "U05", "U06"] as const;
    const counts = new Map(ids.map((id) => [id, 0]));
    for (let seedNumber = 0; seedNumber < 10_000; seedNumber += 1) {
      const seed = seedNumber.toString(16).padStart(64, "0");
      const id = selection.selectRunUniqueId(seed, ids);
      counts.set(id as typeof ids[number], counts.get(id as typeof ids[number])! + 1);
    }

    for (const count of counts.values()) expect(Math.abs(count - (10_000 / 6))).toBeLessThanOrEqual(10_000 / 6 * 0.05);
  });
});
