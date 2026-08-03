import { describe, expect, it } from "vitest";

import { validateEffectDefinition, type CombatEffect } from "../../src/index.js";

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
});
