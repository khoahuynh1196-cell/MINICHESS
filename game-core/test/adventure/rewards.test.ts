import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  buildAdventureRewardPlan,
  compileContentBundle,
  validateAdventureRewardSelections,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const seed = "adventure-reward-seed-001";

describe("deterministic Adventure rewards", () => {
  it("builds identical plans for the same seed, round, and content", () => {
    for (let round = 1; round <= 8; round += 1) {
      const first = buildAdventureRewardPlan({ seed, round, content });
      const second = buildAdventureRewardPlan({ seed, round, content });
      expect(second).toEqual(first);
      expect(first.round).toBe(round);
    }
  });

  it("turns the round-four reveal into a one-of-three Unique choice", () => {
    const plan = buildAdventureRewardPlan({ seed, round: 4, content });
    const uniqueOffer = plan.offers.find((offer) => offer.kind === "unique_choice");

    expect(uniqueOffer?.options).toHaveLength(3);
    expect(uniqueOffer?.options.every((option) => option.kind === "unique")).toBe(true);
    expect(new Set(uniqueOffer?.options.map((option) => option.id)).size).toBe(3);
    for (const option of uniqueOffer?.options ?? []) {
      expect(content.uniqueItems.some((item) => item.id === option.id)).toBe(true);
    }
  });

  it("only exposes options that exist in the compiled content bundle", () => {
    const heroIds = new Set(content.heroesById.keys());
    const normalItemIds = new Set(content.normalItems.map((item) => item.id));
    const uniqueItemIds = new Set(content.uniqueItems.map((item) => item.id));

    for (let round = 1; round <= 8; round += 1) {
      const plan = buildAdventureRewardPlan({ seed, round, content });
      for (const option of plan.offers.flatMap((offer) => offer.options)) {
        if (option.kind === "normal_item") expect(normalItemIds.has(option.id)).toBe(true);
        if (option.kind === "unique") expect(uniqueItemIds.has(option.id)).toBe(true);
        if (option.kind === "hero" || option.kind === "upgrade") expect(heroIds.has(option.id)).toBe(true);
      }
    }
  });

  it("validates exactly one legal selection for each offer", () => {
    const plan = buildAdventureRewardPlan({ seed, round: 4, content });
    const selections = plan.offers.map((offer) => ({ offerId: offer.id, optionId: offer.options[0]!.id }));

    expect(validateAdventureRewardSelections(plan, selections))
      .toEqual(plan.offers.map((offer) => offer.options[0]));
    expect(() => validateAdventureRewardSelections(plan, []))
      .toThrow("ADVENTURE_REWARD_SELECTION_REQUIRED");
    if (plan.offers.length > 0) {
      expect(() => validateAdventureRewardSelections(plan, [
        { offerId: plan.offers[0]!.id, optionId: "missing-option" },
      ])).toThrow();
    }
  });

  it("rejects missing rounds and empty seeds", () => {
    expect(() => buildAdventureRewardPlan({ seed: "", round: 1, content }))
      .toThrow("Adventure reward seed must not be empty");
    expect(() => buildAdventureRewardPlan({ seed, round: 9, content }))
      .toThrow("ENCOUNTER_MISSING:9");
  });
});
