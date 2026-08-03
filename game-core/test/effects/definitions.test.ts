import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle, validateEffectDefinition, type CombatEffect } from "../../src/index.js";

const bundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));

const validEffects: readonly CombatEffect[] = [
  { id: "damage", primitive: "deal_damage", target: "locked_target", baseValue: 1_000, damageType: "magic" },
  { id: "heal", primitive: "heal", target: "lowest_hp_ally", baseValue: 1_000 },
  { id: "shield", primitive: "shield", target: "self", baseValue: 1_000, durationTicks: 20 },
  { id: "stun", primitive: "stun", target: "locked_target", durationTicks: 20 },
  { id: "slow", primitive: "slow", target: "locked_target", baseValue: 250, durationTicks: 20 },
  { id: "buff", primitive: "buff_stat", target: "self", stat: "armor", modifierMode: "flat", baseValue: 1_000, durationTicks: 20 },
  { id: "debuff", primitive: "debuff_stat", target: "locked_target", stat: "armor", modifierMode: "flat", baseValue: 1_000, durationTicks: 20 },
  { id: "dash", primitive: "dash", target: "self", distance: 1 },
  { id: "knockback", primitive: "knockback", target: "locked_target", distance: 1 },
  { id: "summon", primitive: "summon", target: "self", summon: { id: "decoy", maxHp: 10_000, durationTicks: 20 } },
  { id: "dot", primitive: "apply_dot", target: "locked_target", baseValue: 1_000, durationTicks: 20, intervalTicks: 5, damageType: "magic" },
  { id: "cleanse", primitive: "cleanse", target: "self" },
];

describe("effect definition contract", () => {
  it("accepts every Alpha effect primitive through one validator", () => {
    expect(() => validEffects.forEach(validateEffectDefinition)).not.toThrow();
  });

  it("rejects an effect missing fields required by its primitive", () => {
    expect(() =>
      validateEffectDefinition({
        id: "invalid-dot",
        primitive: "apply_dot",
        target: "locked_target",
        baseValue: 1_000,
        durationTicks: 10,
        damageType: "magic",
      }),
    ).toThrow(/intervalTicks/);
  });

  it("normalizes and validates every effect embedded in Alpha item triggers", () => {
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const itemEffects = [...content.normalItems, ...content.uniqueItems]
      .flatMap((item) => item.triggers)
      .flatMap((trigger) => trigger.effects);

    expect(itemEffects.length).toBeGreaterThan(0);
    expect(() => itemEffects.forEach(validateEffectDefinition)).not.toThrow();
  });
});
