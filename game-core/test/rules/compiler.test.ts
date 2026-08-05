import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { compileRuleset } from "../../src/index.js";

const path = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const raw = JSON.parse(readFileSync(path, "utf8"));

describe("production ruleset compiler", () => {
  it("compiles the locked contract", () => {
    const rules = compileRuleset(raw);

    expect(rules.version).toBe("production-rules-0.1.0");
    expect(rules.board).toEqual({
      columns: 4,
      rows: 8,
      enemyRows: { start: 0, end: 3 },
      playerRows: { start: 4, end: 7 },
      movement: "orthogonal",
    });
    expect(rules.shop.slotCount).toBe(5);
    expect(rules.roster).toEqual({ benchSlots: 8, maxItemsPerHero: 2, maxUniquePerTeam: 1 });
    expect(rules.progression.levels.at(-1)).toEqual({ level: 9, xpToNext: 0, boardCap: 8 });
    expect(rules.adventure).toMatchObject({ initialHealth: 30, initialGold: 8, roundCount: 8, uniqueRevealRound: 4 });
    expect(rules.standard).toMatchObject({ initialHealth: 100, initialGold: 10, interestCap: 5, streakBonusCap: 3 });
    expect(rules.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("returns deeply frozen compiled rules", () => {
    const rules = compileRuleset(raw);

    expect(Object.isFrozen(rules)).toBe(true);
    expect(Object.isFrozen(rules.board)).toBe(true);
    expect(Object.isFrozen(rules.board.enemyRows)).toBe(true);
    expect(Object.isFrozen(rules.shop.oddsByLevel[3])).toBe(true);
    expect(Object.isFrozen(rules.progression.levels)).toBe(true);
    expect(Object.isFrozen(rules.progression.levels[0])).toBe(true);
  });

  it("rejects odds that do not sum to 100", () => {
    const invalid = structuredClone(raw);
    invalid.shop.odds_by_level["3"] = [54, 35, 10, 0, 0];

    expect(() => compileRuleset(invalid)).toThrow("shop.odds_by_level.3 must sum to 100");
  });

  it("rejects overlapping territories", () => {
    const invalid = structuredClone(raw);
    invalid.board.player_rows.start = 3;

    expect(() => compileRuleset(invalid)).toThrow("board side rows must not overlap");
  });

  it("rejects unequal four-row side territories", () => {
    const invalid = structuredClone(raw);
    invalid.board.enemy_rows.end = 2;
    invalid.board.player_rows.start = 3;

    expect(() => compileRuleset(invalid)).toThrow("board sides must each contain four rows");
  });

  it("rejects a board cap above the sixteen-cell player half", () => {
    const invalid = structuredClone(raw);
    invalid.progression.levels[6].board_cap = 17;

    expect(() => compileRuleset(invalid)).toThrow("board_cap exceeds player board cells");
  });
});
