import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertAdventureRoster,
  compileRuleset,
  createEmptyAdventureRoster,
  freezeAdventureRoster,
  locateAdventureHero,
  mergeAdventureRoster,
  moveAdventureHero,
  type AdventureHeroInstance,
  type AdventureRoster,
} from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function hero(
  instanceId: string,
  acquisitionOrder: number,
  options: Partial<AdventureHeroInstance> = {},
): AdventureHeroInstance {
  return Object.freeze({
    instanceId,
    heroId: "H01",
    cost: 1,
    stars: 1,
    poolCopies: 1,
    acquisitionOrder,
    ...options,
  });
}

function rosterWith(
  boardEntries: Readonly<Record<number, AdventureHeroInstance>> = {},
  benchEntries: Readonly<Record<number, AdventureHeroInstance>> = {},
  items: AdventureRoster["items"] = [],
): AdventureRoster {
  const empty = createEmptyAdventureRoster(rules);
  const board = [...empty.board];
  const bench = [...empty.bench];
  for (const [index, value] of Object.entries(boardEntries)) board[Number(index)] = value;
  for (const [index, value] of Object.entries(benchEntries)) bench[Number(index)] = value;
  return freezeAdventureRoster({ board, bench, items });
}

describe("pure Adventure roster", () => {
  it("creates rules-sized immutable board and bench storage", () => {
    const roster = createEmptyAdventureRoster(rules);

    expect(roster.board).toHaveLength(16);
    expect(roster.bench).toHaveLength(8);
    expect(roster.board.every((entry) => entry === null)).toBe(true);
    expect(roster.bench.every((entry) => entry === null)).toBe(true);
    expect(Object.isFrozen(roster)).toBe(true);
    expect(Object.isFrozen(roster.board)).toBe(true);
  });

  it("moves a bench hero onto the board without mutating the input", () => {
    const original = rosterWith({}, { 0: hero("hero-a", 1) });
    const moved = moveAdventureHero(rules, original, 3, "hero-a", { kind: "board", index: 4 });

    expect(moved.board[4]?.instanceId).toBe("hero-a");
    expect(moved.bench[0]).toBeNull();
    expect(original.board[4]).toBeNull();
    expect(original.bench[0]?.instanceId).toBe("hero-a");
  });

  it("swaps occupied destinations and preserves both hero instances", () => {
    const original = rosterWith({ 0: hero("board-a", 1), 1: hero("board-b", 2) });
    const moved = moveAdventureHero(rules, original, 3, "board-a", { kind: "board", index: 1 });

    expect(moved.board[0]?.instanceId).toBe("board-b");
    expect(moved.board[1]?.instanceId).toBe("board-a");
  });

  it("rejects a bench-to-empty-board move above the deployment cap", () => {
    const original = rosterWith({
      0: hero("board-a", 1),
      1: hero("board-b", 2),
      2: hero("board-c", 3),
    }, { 0: hero("bench-d", 4) });

    expect(() => moveAdventureHero(rules, original, 3, "bench-d", { kind: "board", index: 3 }))
      .toThrow("Adventure roster exceeds deployment cap");
    expect(original.bench[0]?.instanceId).toBe("bench-d");
  });

  it("fails closed for duplicate heroes, orphan items, and item overflow", () => {
    const duplicate = rosterWith({ 0: hero("same", 1) }, { 0: hero("same", 2) });
    expect(() => assertAdventureRoster(rules, duplicate, 3)).toThrow("Duplicate hero instance: same");

    const orphan = rosterWith({}, {}, [{
      instanceId: "item-a", itemId: "I01", kind: "normal", equippedHeroInstanceId: "missing",
    }]);
    expect(() => assertAdventureRoster(rules, orphan, 3)).toThrow("equipped to a missing hero");

    const overloaded = rosterWith({ 0: hero("holder", 1) }, {}, [
      { instanceId: "item-1", itemId: "I01", kind: "normal", equippedHeroInstanceId: "holder" },
      { instanceId: "item-2", itemId: "I02", kind: "normal", equippedHeroInstanceId: "holder" },
      { instanceId: "item-3", itemId: "I03", kind: "normal", equippedHeroInstanceId: "holder" },
    ]);
    expect(() => assertAdventureRoster(rules, overloaded, 3)).toThrow("exceeds item capacity");
  });

  it("merges three copies while preserving a deployed survivor and transferring Unique", () => {
    const original = rosterWith({ 4: hero("board-copy", 1) }, {
      0: hero("unique-copy", 2),
      1: hero("bench-copy", 3),
    }, [
      { instanceId: "normal-item", itemId: "I01", kind: "normal", equippedHeroInstanceId: "board-copy" },
      { instanceId: "unique-item", itemId: "U01", kind: "unique", equippedHeroInstanceId: "unique-copy" },
    ]);

    const merged = mergeAdventureRoster(rules, original, 3);

    expect(merged.board[4]).toMatchObject({
      instanceId: "board-copy", heroId: "H01", stars: 2, poolCopies: 3,
    });
    expect(merged.bench.every((entry) => entry === null)).toBe(true);
    expect(merged.items).toContainEqual({ instanceId: "normal-item", itemId: "I01", kind: "normal" });
    expect(merged.items).toContainEqual({
      instanceId: "unique-item", itemId: "U01", kind: "unique", equippedHeroInstanceId: "board-copy",
    });
  });

  it("cascades nine copies into one deterministic three-star hero", () => {
    const boardEntries = { 0: hero("copy-1", 1) };
    const benchEntries = Object.fromEntries(Array.from({ length: 8 }, (_, index) =>
      [index, hero(`copy-${index + 2}`, index + 2)]));
    const merged = mergeAdventureRoster(rules, rosterWith(boardEntries, benchEntries), 3);

    expect(merged.board[0]).toMatchObject({ instanceId: "copy-1", stars: 3, poolCopies: 9 });
    expect(merged.board.filter((entry) => entry !== null)).toHaveLength(1);
    expect(merged.bench.every((entry) => entry === null)).toBe(true);
    expect(locateAdventureHero(merged, "copy-1")?.kind).toBe("board");
  });
});
