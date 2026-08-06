import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buyExperience,
  canBuyExperience,
  compileRuleset,
  initialProgressionState,
  progressionState,
  shopOddsAtLevel,
} from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

describe("rules-driven progression", () => {
  it("creates the canonical initial progression state", () => {
    expect(initialProgressionState(rules)).toEqual({ level: 3, experience: 0, xpToNext: 10, boardCap: 3 });
  });

  it("buys four experience without leveling before the threshold", () => {
    expect(buyExperience(rules, { level: 3, experience: 0 }))
      .toEqual({ level: 3, experience: 4, xpToNext: 10, boardCap: 3 });
  });

  it("levels up and carries excess experience deterministically", () => {
    expect(buyExperience(rules, { level: 3, experience: 8 }))
      .toEqual({ level: 4, experience: 2, xpToNext: 20, boardCap: 4 });
  });

  it("rejects invalid experience and additional purchases at the level cap", () => {
    expect(() => progressionState(rules, 3, 10)).toThrow("experience is outside the current level range");
    expect(canBuyExperience(rules, { level: 9, experience: 0 })).toBe(false);
    expect(() => buyExperience(rules, { level: 9, experience: 0 })).toThrow("Player is already at maximum level");
  });

  it("reads shop odds from the same compiled contract", () => {
    expect(shopOddsAtLevel(rules, 3)).toEqual([55, 35, 10, 0, 0]);
    expect(shopOddsAtLevel(rules, 9)).toEqual([5, 10, 20, 35, 30]);
  });
});
