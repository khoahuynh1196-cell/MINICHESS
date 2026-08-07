import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adventureRoundIncome,
  compileRuleset,
  standardRoundIncome,
  standardStreakBonus,
} from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

describe("rules-driven economy", () => {
  it("returns the fixed Adventure round income without online modifiers", () => {
    expect(adventureRoundIncome(rules)).toEqual({ base: 5, interest: 0, streak: 0, total: 5 });
  });

  it("calculates standard interest and streak from the authored thresholds", () => {
    expect(standardRoundIncome(rules, 27, 4)).toEqual({ base: 5, interest: 2, streak: 2, total: 9 });
    expect(standardRoundIncome(rules, 50, -6)).toEqual({ base: 5, interest: 5, streak: 3, total: 13 });
  });

  it("caps interest and applies no streak bonus below the first threshold", () => {
    expect(standardRoundIncome(rules, 999, 1)).toEqual({ base: 5, interest: 5, streak: 0, total: 10 });
  });

  it("uses the same threshold curve for win and loss streak magnitudes", () => {
    expect(standardStreakBonus(rules, 2)).toBe(1);
    expect(standardStreakBonus(rules, -4)).toBe(2);
    expect(standardStreakBonus(rules, 99)).toBe(3);
  });

  it("rejects invalid economy inputs", () => {
    expect(() => standardRoundIncome(rules, -1, 0)).toThrow("goldBeforeIncome must be a safe integer >= 0");
    expect(() => standardStreakBonus(rules, 1.5)).toThrow("streakCount must be a safe integer");
  });
});
