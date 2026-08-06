import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRuleset } from "../../src/rules/compiler.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const authoredRules: unknown = JSON.parse(readFileSync(rulesPath, "utf8"));

describe("production ruleset compiler", () => {
  it("compiles the locked offline-first contract", () => {
    const rules = compileRuleset(authoredRules);

    expect(rules.version).toBe("production-rules-0.1.0");
    expect(rules.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rules.combat).toEqual({ tickRate: 20, maxTicks: 700 });
    expect(rules.board).toEqual({
      columns: 4,
      rows: 8,
      enemyRows: { start: 0, end: 3 },
      playerRows: { start: 4, end: 7 },
      movement: "orthogonal",
    });
    expect(rules.roster).toEqual({ benchSlots: 8, maxItemsPerHero: 2, maxUniquePerTeam: 1 });
    expect(rules.shop.slotCount).toBe(5);
    expect(rules.shop.oddsByLevel[3]).toEqual([55, 35, 10, 0, 0]);
    expect(rules.progression).toMatchObject({ initialLevel: 3, maxLevel: 9, xpPurchaseCost: 4, xpPerPurchase: 4 });
    expect(rules.progression.levels.at(-1)).toEqual({ level: 9, xpToNext: 0, boardCap: 8 });
    expect(rules.adventure).toEqual({
      initialHealth: 30,
      initialGold: 8,
      baseRoundIncome: 5,
      roundCount: 8,
      uniqueRevealRound: 4,
      lossDamage: { base: 4, perSurvivor: 2, cap: 12 },
    });
    expect(rules.standard).toEqual({
      initialHealth: 100,
      initialGold: 10,
      baseRoundIncome: 5,
      interestStep: 10,
      interestCap: 5,
      streakBonusCap: 3,
      streakBonuses: [
        { count: 2, bonus: 1 },
        { count: 4, bonus: 2 },
        { count: 6, bonus: 3 },
      ],
    });
  });

  it("rejects shop odds that do not total one hundred", () => {
    const invalid = structuredClone(authoredRules) as {
      shop: { odds_by_level: Record<string, number[]> };
    };
    invalid.shop.odds_by_level["3"] = [54, 35, 10, 0, 0];

    expect(() => compileRuleset(invalid)).toThrow("shop.odds_by_level.3 must sum to 100");
  });

  it("rejects board side ranges with a gap or overlap", () => {
    const invalid = structuredClone(authoredRules) as {
      board: { player_rows: { start: number } };
    };
    invalid.board.player_rows.start = 3;

    expect(() => compileRuleset(invalid)).toThrow("board side rows must cover the board without gaps or overlap");
  });

  it("rejects progression that deploys more units than the player half contains", () => {
    const invalid = structuredClone(authoredRules) as {
      progression: { levels: Array<{ board_cap: number }> };
    };
    invalid.progression.levels[6]!.board_cap = 17;

    expect(() => compileRuleset(invalid)).toThrow("board_cap exceeds player board cells");
  });

  it("rejects missing shop odds for a playable level instead of defaulting", () => {
    const invalid = structuredClone(authoredRules) as {
      shop: { odds_by_level: Record<string, number[]> };
    };
    delete invalid.shop.odds_by_level["7"];

    expect(() => compileRuleset(invalid)).toThrow("shop.odds_by_level must define exactly levels 3,4,5,6,7,8,9");
  });

  it("rejects non-increasing streak thresholds", () => {
    const invalid = structuredClone(authoredRules) as {
      standard: { streak_bonuses: Array<{ count: number; bonus: number }> };
    };
    invalid.standard.streak_bonuses[1]!.count = 2;

    expect(() => compileRuleset(invalid)).toThrow("standard.streak_bonuses counts must increase");
  });

  it("rejects an Adventure loss cap below its base damage", () => {
    const invalid = structuredClone(authoredRules) as {
      adventure: { loss_damage: { base: number; cap: number } };
    };
    invalid.adventure.loss_damage.cap = invalid.adventure.loss_damage.base - 1;

    expect(() => compileRuleset(invalid)).toThrow("adventure.loss_damage.cap must be >= base");
  });
});
