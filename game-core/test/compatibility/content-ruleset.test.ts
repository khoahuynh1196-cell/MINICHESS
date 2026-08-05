import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  compileContentBundle,
  compileRuleset,
  validateContentAgainstRuleset,
} from "../../src/index.js";

const read = (relative: string): unknown => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const rules = compileRuleset(read("../../../rules/production-0.1.0/ruleset.json"));

describe("content and ruleset compatibility", () => {
  it("accepts the migrated retained content", () => {
    const content = compileContentBundle(read("../../../content/alpha-0.4.0/bundle.json"));
    expect(() => validateContentAgainstRuleset(content, rules)).not.toThrow();
    expect([...content.heroesById.keys()]).toEqual(Array.from({ length: 20 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`));
    expect(content.uniqueItems.map((item) => item.id)).toEqual(["U01", "U02", "U03", "U04", "U05", "U06"]);
  });

  it("rejects an enemy outside enemy territory", () => {
    const raw = read("../../../content/alpha-0.4.0/bundle.json") as { encounters: Array<{ enemy_composition?: Array<{ position: number }> }> };
    raw.encounters[0]!.enemy_composition![0]!.position = 16;
    expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules))
      .toThrow("encounter enemy outside enemy territory");
  });

  it("rejects a trait breakpoint above the launch deployment cap", () => {
    const raw = read("../../../content/alpha-0.4.0/bundle.json") as { traits: Array<{ breakpoints: Array<{ count: number }> }> };
    raw.traits[0]!.breakpoints.at(-1)!.count = 9;
    expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules))
      .toThrow("trait breakpoint exceeds deployment cap");
  });

  it("requires exactly one Unique reveal on the ruleset round", () => {
    const raw = read("../../../content/alpha-0.4.0/bundle.json") as { encounters: Array<{ round: number; rewards: Array<{ kind: string }> }> };
    const reveal = raw.encounters.find((encounter) => encounter.round === 4)!.rewards.find((reward) => reward.kind === "unique_reveal")!;
    raw.encounters.find((encounter) => encounter.round === 4)!.rewards = raw.encounters.find((encounter) => encounter.round === 4)!.rewards.filter((reward) => reward !== reveal);
    raw.encounters.find((encounter) => encounter.round === 5)!.rewards.push(reveal);
    expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules))
      .toThrow("unique_reveal does not match ruleset round");
  });

  it("rejects an item slot cost above the ruleset limit", () => {
    const raw = read("../../../content/alpha-0.4.0/bundle.json") as { normal_items: Array<{ slot_cost: number }> };
    raw.normal_items[0]!.slot_cost = 3;
    expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules))
      .toThrow("item slot cost exceeds ruleset limit");
  });
});
