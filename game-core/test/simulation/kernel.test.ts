import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  canonicalizeSnapshot,
  compileContentBundle,
  createSeededRng,
  findPathToRange,
  runHeadlessCombat,
  resolveDamage,
  selectNearestTarget,
  type CombatSnapshot,
  type CombatEffect,
  type CombatPassive,
} from "../../src/index.js";

const bundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

function contentSkill(skillId: string): { id: string; castTimeTicks: number; effects: readonly CombatEffect[] } {
  const skill = content.skillsById.get(skillId);
  if (skill === undefined) throw new Error(`Missing content skill ${skillId}`);
  return {
    id: skill.id,
    castTimeTicks: skill.cast_time_ticks,
    effects: skill.effects.map((effect) => {
      const raw = effect as Record<string, unknown>;
      return {
        id: effect.id,
        primitive: effect.primitive as CombatEffect["primitive"],
        target: effect.target as CombatEffect["target"],
        ...(typeof raw.base_value === "number" ? { baseValue: raw.base_value } : {}),
        ...(typeof raw.duration_ticks === "number" ? { durationTicks: raw.duration_ticks } : {}),
        ...(typeof raw.damage_type === "string" ? { damageType: raw.damage_type as NonNullable<CombatEffect["damageType"]> } : {}),
        ...(typeof raw.distance === "number" ? { distance: raw.distance } : {}),
        ...(typeof raw.stat === "string" ? { stat: raw.stat as CombatEffect["stat"] } : {}),
        ...(typeof raw.mode === "string" ? { modifierMode: raw.mode as CombatEffect["modifierMode"] } : {}),
        ...(raw.cleanseable === true ? { cleanseable: true } : {}),
        ...(raw.summon === undefined ? {} : {
          summon: {
            id: (raw.summon as { id: string }).id,
            maxHp: (raw.summon as { max_hp: number }).max_hp,
            durationTicks: (raw.summon as { duration_ticks: number }).duration_ticks,
          },
        }),
      } as CombatEffect;
    }),
  };
}

function contentPassive(ownerId: string, trigger: (typeof content.normalItems)[number]["triggers"][number]): CombatPassive {
  return {
    ownerId,
    triggerId: trigger.id,
    trigger: trigger.trigger,
    effects: trigger.effects,
    ...(trigger.cooldownTicks === undefined ? {} : { cooldownTicks: trigger.cooldownTicks }),
    ...(trigger.thresholdPercent === undefined ? {} : { thresholdPercent: trigger.thresholdPercent }),
    ...(trigger.attackCount === undefined ? {} : { attackCount: trigger.attackCount }),
    ...(trigger.oncePerCombat === undefined ? {} : { oncePerCombat: trigger.oncePerCombat }),
    ...(trigger.basicOnly === undefined ? {} : { basicOnly: trigger.basicOnly }),
    ...(trigger.lifestealPerThousand === undefined ? {} : { lifestealPerThousand: trigger.lifestealPerThousand }),
  };
}

function runContentSkill(skillId: string, targetPosition = 13) {
  return runHeadlessCombat({
    ...snapshot,
    maxTicks: 11,
    units: [
      { ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000, maxMana: 100_000, skill: contentSkill(skillId) },
      { ...snapshot.units[1]!, position: targetPosition, attackSpeed: 0, attackRange: 20, maxHp: 1_000_000 },
    ],
  });
}

const snapshot: CombatSnapshot = {
  combatId: "combat-001",
  contentVersion: "alpha-0.3.0",
  rulesetVersion: "alpha-0.3.0",
  combatSeed: "combat-seed-001",
  maxTicks: 3,
  defenderSide: "enemy",
  units: [
    {
      id: "enemy:E01:1",
      side: "enemy",
      position: 9,
      maxHp: 100_000,
      attackDamage: 5_000,
      attackSpeed: 1_000,
      armor: 0,
      magicResist: 0,
      attackRange: 1,
      startingMana: 0,
      maxMana: 100_000,
      critChance: 0,
      critMultiplier: 1_500,
    },
    {
      id: "player:H01:1",
      side: "player",
      position: 12,
      maxHp: 100_000,
      attackDamage: 5_000,
      attackSpeed: 1_000,
      armor: 0,
      magicResist: 0,
      attackRange: 1,
      startingMana: 0,
      maxMana: 100_000,
      critChance: 0,
      critMultiplier: 1_500,
    },
  ],
};

describe("deterministic combat kernel", () => {
  it("executes Alpha damage skill S_H03 against its locked target", () => {
    expect(runContentSkill("S_H03").events).toContainEqual(expect.objectContaining({
      type: "DAMAGE_APPLIED", sourceUnitId: "enemy:E01:1", payload: expect.objectContaining({ amount: 18_000 }),
    }));
  });

  it("executes Alpha shield skill S_H01 on its caster", () => {
    expect(runContentSkill("S_H01").events).toContainEqual(expect.objectContaining({
      type: "SHIELD_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1", payload: expect.objectContaining({ amount: 22_000 }),
    }));
  });

  it("executes Alpha stun skill S_H07 against its locked target", () => {
    expect(runContentSkill("S_H07").events).toContainEqual(expect.objectContaining({
      type: "STUN_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H01:1",
    }));
  });

  it("executes Alpha buff skill S_H08 on its caster", () => {
    expect(runContentSkill("S_H08").events).toContainEqual(expect.objectContaining({
      type: "STAT_MODIFIER_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1", payload: { stat: "attack_damage", value: 1_500 },
    }));
  });

  it("executes Alpha dash skill S_H02 toward its locked target", () => {
    expect(runContentSkill("S_H02", 18).events).toContainEqual(expect.objectContaining({
      type: "UNIT_DISPLACED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1", payload: { from: 9, to: 14 },
    }));
  });

  it("executes Alpha knockback skill S_H16 against its locked target", () => {
    expect(runContentSkill("S_H16").events).toContainEqual(expect.objectContaining({
      type: "UNIT_DISPLACED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H01:1", payload: { from: 13, to: 21 },
    }));
  });

  it("executes the Alpha debuff, summon, and cleanse skills as content-defined effects", () => {
    const debuff = runHeadlessCombat({
      ...snapshot,
      maxTicks: 11,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000, skill: contentSkill("S_H04") },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });
    const summon = runHeadlessCombat({
      ...snapshot,
      maxTicks: 11,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000, skill: contentSkill("S_H15") },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });
    const cleanse = runHeadlessCombat({
      ...snapshot,
      maxTicks: 11,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000, skill: contentSkill("S_H17"),
          passives: [{
            ownerId: "test", triggerId: "test:debuff", trigger: "on_combat_start",
            effects: [{ id: "E_TEST_CLEANSEABLE_DEBUFF", primitive: "debuff_stat", target: "self", stat: "attack_damage", modifierMode: "flat", baseValue: 1_000, durationTicks: 20, cleanseable: true }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });

    expect(debuff.events).toContainEqual(expect.objectContaining({ type: "STAT_MODIFIER_APPLIED", payload: { stat: "attack_speed", value: 150 } }));
    expect(summon.events).toContainEqual(expect.objectContaining({ type: "UNIT_SUMMONED" }));
    expect(cleanse.events).toContainEqual(expect.objectContaining({ type: "CLEANSE_APPLIED", sourceUnitId: "enemy:E01:1" }));
  });

  it("canonicalizes unit ordering without changing the input snapshot", () => {
    const canonical = canonicalizeSnapshot(snapshot);

    expect(canonical.units.map((unit) => unit.id)).toEqual([
      "enemy:E01:1",
      "player:H01:1",
    ]);
    expect(snapshot.units[0]?.id).toBe("enemy:E01:1");
  });

  it("accepts every globally valid cell for each combat side and rejects cell 24", () => {
    for (let position = 0; position < 12; position += 1) {
      expect(() => canonicalizeSnapshot({
        ...snapshot,
        units: [{ ...snapshot.units[0]!, position }],
      })).not.toThrow();
    }

    for (let position = 12; position < 24; position += 1) {
      expect(() => canonicalizeSnapshot({
        ...snapshot,
        units: [{ ...snapshot.units[1]!, position }],
      })).not.toThrow();
    }

    expect(() => canonicalizeSnapshot({
      ...snapshot,
      units: [{ ...snapshot.units[0]!, position: 24 }],
    })).toThrow(/Invalid board position/);
  });

  it("rejects units placed on the opposing side of the combat board", () => {
    expect(() => canonicalizeSnapshot({
      ...snapshot,
      units: [{ ...snapshot.units[1]!, position: 11 }],
    })).toThrow(/Invalid board position/);

    expect(() => canonicalizeSnapshot({
      ...snapshot,
      units: [{ ...snapshot.units[0]!, position: 12 }],
    })).toThrow(/Invalid board position/);
  });

  it("does not wrap paths from the end of one four-column row to the start of the next", () => {
    expect(findPathToRange(3, 4, 1, [3, 4])).toEqual([2, 1, 0]);
  });

  it("moves players from the player half toward enemies in deterministic four-column steps", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 0 },
        { ...snapshot.units[1]!, position: 12 },
      ],
    });

    expect(result.events.filter((event) => event.type === "UNIT_MOVED")).toEqual([
      expect.objectContaining({ sourceUnitId: "enemy:E01:1", payload: { from: 0, to: 4 } }),
      expect.objectContaining({ sourceUnitId: "player:H01:1", payload: { from: 12, to: 8 } }),
    ]);
  });

  it("emits the exact same event log and result hash for identical input", () => {
    const first = runHeadlessCombat(snapshot);
    const second = runHeadlessCombat({ ...snapshot, units: [...snapshot.units].reverse() });

    expect(second.events).toEqual(first.events);
    expect(second.resultHash).toBe(first.resultHash);
    expect(second.finalTick).toBe(3);
  });

  it("keeps replay hashes stable across 1,000 canonicalized snapshot orderings", () => {
    for (let seed = 0; seed < 1_000; seed += 1) {
      const input = { ...snapshot, combatId: `combat-stress-${seed}`, combatSeed: `seed-stress-${seed}` };
      expect(runHeadlessCombat(input).resultHash).toBe(runHeadlessCombat({ ...input, units: [...input.units].reverse() }).resultHash);
    }
  });

  it("executes a canonical combat-start passive before the first combat tick", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!,
          passives: [{
            ownerId: "I10", triggerId: "I10:trigger:0", trigger: "on_combat_start",
            effects: [{ id: "E_I10", primitive: "shield", target: "self", baseValue: 12_000, durationTicks: 120 }],
          }],
        },
        snapshot.units[1]!,
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      tick: 0, type: "SHIELD_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1", payload: { amount: 12_000, expiresAtTick: 120 },
    }));
  });

  it("scales a max-HP passive effect using per-thousand integer arithmetic", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!,
          passives: [{
            ownerId: "U03", triggerId: "U03:trigger:0", trigger: "on_combat_start",
            effects: [{ id: "E_U03", primitive: "shield", target: "self", baseValue: 120, durationTicks: 120, scalesWithMaxHp: true }],
          }],
        },
        snapshot.units[1]!,
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({ type: "SHIELD_APPLIED", payload: expect.objectContaining({ amount: 12_000 }) }));
  });

  it("dispatches a basic-attack passive after the attack and observes its cooldown", () => {
    const frostSigil = content.normalItems.find((item) => item.id === "I12");
    if (frostSigil === undefined) throw new Error("Missing Alpha item I12");
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 20_000,
          passives: [contentPassive(frostSigil.id, frostSigil.triggers[0]!)],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 1_000_000 },
      ],
    });

    expect(result.events.filter((event) => event.type === "BASIC_ATTACK")).toHaveLength(2);
    expect(result.events.filter((event) => event.type === "SLOW_APPLIED")).toHaveLength(1);
  });

  it("dispatches a cast-resolve passive after the holder's skill effects", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000,
          skill: { id: "S_CAST", castTimeTicks: 1, effects: [] },
          passives: [{
            ownerId: "I11", triggerId: "I11:trigger:0", trigger: "on_cast_resolve",
            effects: [{ id: "E_I11", primitive: "deal_damage", target: "locked_target", baseValue: 6_000, damageType: "magic" }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 1_000_000, attackSpeed: 0 },
      ],
    });

    const cast = result.events.find((event) => event.type === "CAST_RESOLVED");
    const bonusDamage = result.events.find((event) => event.type === "DAMAGE_APPLIED" && event.payload.amount === 6_000);
    expect(cast).toBeDefined();
    expect(bonusDamage?.sequence).toBeGreaterThan(cast!.sequence);
  });

  it("fires a low-HP passive exactly once after damage crosses its threshold", () => {
    const lionCrown = content.uniqueItems.find((item) => item.id === "U01");
    if (lionCrown === undefined) throw new Error("Missing Alpha Unique U01");
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 0,
          passives: [contentPassive(lionCrown.id, lionCrown.triggers[0]!)],
        },
        { ...snapshot.units[1]!, position: 12, attackDamage: 60_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.events.filter((event) => event.type === "STUN_APPLIED")).toHaveLength(1);
    expect(result.events.find((event) => event.type === "STUN_APPLIED")?.sourceUnitId).toBe("enemy:E01:1");
  });

  it("marks a once-per-combat passive before effects so it cannot recursively re-enter", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 9,
          passives: [{
            ownerId: "safe", triggerId: "safe:threshold", trigger: "on_hp_below", thresholdPercent: 500, oncePerCombat: true,
            effects: [{ id: "E_SAFE", primitive: "deal_damage", target: "self", baseValue: 1, damageType: "true" }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, attackDamage: 60_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.events.filter((event) => event.type === "EFFECT_APPLIED" && event.payload.effectId === "E_SAFE")).toHaveLength(1);
  });

  it("dispatches an every-nth-basic-attack passive on the declared attack count", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 20_000,
          passives: [{
            ownerId: "U02", triggerId: "U02:trigger:0", trigger: "on_every_nth_basic_attack", attackCount: 3,
            effects: [{ id: "E_U02", primitive: "deal_damage", target: "locked_target", baseValue: 350, damageType: "physical" }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 1_000_000, attackSpeed: 0 },
      ],
    });

    expect(result.events.filter((event) => event.type === "DAMAGE_APPLIED" && event.payload.amount === 350)).toHaveLength(1);
  });

  it("dispatches a critical-basic-attack passive with damage scaled from the holder attack stat", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackDamage: 8_000, attackSpeed: 20_000, critChance: 1_000,
          passives: [{
            ownerId: "R_CAT", triggerId: "R_CAT:crit", trigger: "on_critical_basic_attack" as "on_basic_attack", oncePerCombat: true,
            effects: [{ id: "E_R_CAT_CRIT", primitive: "deal_damage", target: "locked_target", baseValue: 250, damageType: "physical", scalesWithAttackDamage: true } as CombatEffect],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 1_000_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "DAMAGE_APPLIED", sourceUnitId: "enemy:E01:1", payload: expect.objectContaining({ amount: 2_000 }),
    }));
  });

  it("applies generic post-mitigation lifesteal after a basic attack", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackDamage: 5_000, attackSpeed: 20_000,
          passives: [{
            ownerId: "I09", triggerId: "I09:trigger:0", trigger: "on_damage_dealt", basicOnly: true, lifestealPerThousand: 150, effects: [],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 1_000_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({ type: "HEAL_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1", payload: expect.objectContaining({ amount: 750 }) }));
  });

  it("scales a max-HP summon passive while retaining the shared summon cap", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000,
          skill: { id: "S_CAST", castTimeTicks: 1, effects: [] },
          passives: [{
            ownerId: "U05", triggerId: "U05:trigger:0", trigger: "on_cast_resolve", oncePerCombat: true,
            effects: [{ id: "E_U05", primitive: "summon", target: "self", scalesWithMaxHp: true, summon: { id: "decoy", maxHp: 250, durationTicks: 80 } }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });

    expect(result.units.find((unit) => unit.isSummon)).toMatchObject({ currentHp: 25_000 });
  });
  it("heals the lowest-HP ally with a scaled max-HP first-skill-cast Unique passive", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 4,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 20_000, attackDamage: 20_000,
        },
        {
          ...snapshot.units[1]!, id: "player:H02:1", position: 12, attackSpeed: 0, maxHp: 100_000,
          skill: { id: "S_CAST", castTimeTicks: 1, effects: [] },
          startingMana: 100_000, maxMana: 100_000,
          passives: [{
            ownerId: "U04", triggerId: "U04:trigger:0", trigger: "on_cast_resolve", oncePerCombat: true,
            effects: [{ id: "E_U04", primitive: "heal", target: "lowest_hp_ally", baseValue: 120, scalesWithMaxHp: true }],
          }],
        },
        {
          ...snapshot.units[1]!, id: "player:H03:1", position: 13, attackSpeed: 0, maxHp: 100_000,
          startingMana: 0, maxMana: 1,
        },
      ],
    });

    const healEvent = result.events.find((event) => event.type === "HEAL_APPLIED");
    expect(healEvent).toBeDefined();
    expect(healEvent!.payload.amount).toBe(12_000);
    expect(healEvent!.targetUnitId).toBe("player:H03:1");
  });

  it("cleanses and shields the holder when HP drops below a Unique threshold", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackDamage: 71_000, attackSpeed: 20_000,
        },
        {
          ...snapshot.units[1]!, position: 12, attackSpeed: 0, maxHp: 100_000, armor: 0,
          passives: [{
            ownerId: "U06", triggerId: "U06:trigger:0", trigger: "on_hp_below", thresholdPercent: 300, oncePerCombat: true,
            effects: [
              { id: "E_U06A", primitive: "cleanse", target: "self" },
              { id: "E_U06B", primitive: "shield", target: "self", baseValue: 150, durationTicks: 80, scalesWithMaxHp: true },
            ],
          }],
        },
      ],
    });

    const cleanseEvent = result.events.find((event) => event.type === "CLEANSE_APPLIED");
    expect(cleanseEvent).toBeDefined();
    const shieldEvent = result.events.find((event) => event.type === "SHIELD_APPLIED" && event.targetUnitId === "player:H01:1");
    expect(shieldEvent).toBeDefined();
    expect(shieldEvent!.payload.amount).toBe(15_000);
  });


  it("uses a deterministic seeded RNG", () => {
    const first = createSeededRng("same-seed");
    const second = createSeededRng("same-seed");
    const different = createSeededRng("different-seed");
    const firstSequence = [first.nextUint32(), first.nextUint32(), first.nextUint32()];
    const secondSequence = [second.nextUint32(), second.nextUint32(), second.nextUint32()];
    const differentSequence = [different.nextUint32(), different.nextUint32(), different.nextUint32()];

    expect(secondSequence).toEqual(firstSequence);
    expect(differentSequence).not.toEqual(firstSequence);
  });

  it("ends at the configured tick cap with the defender winning a tie", () => {
    const result = runHeadlessCombat(snapshot);

    expect(result.winner).toBe("enemy");
    expect(result.reason).toBe("timeout");
    expect(result.events.at(-1)).toMatchObject({
      tick: 3,
      type: "COMBAT_ENDED",
      payload: { reason: "timeout", winner: "enemy" },
    });
    expect(result.units).toEqual(expect.arrayContaining([expect.objectContaining({ id: "enemy:E01:1", isSummon: false })]));
  });

  it("awards an equal timeout score to the configured defender", () => {
    const result = runHeadlessCombat({ ...snapshot, defenderSide: "player" });

    expect(result.reason).toBe("timeout");
    expect(result.winner).toBe("player");
  });

  it("awards a timeout to the player with the greater aggregate HP ratio", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 9, attackDamage: 10_000, attackSpeed: 20_000 },
        { ...snapshot.units[1]!, position: 12, attackDamage: 50_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.reason).toBe("timeout");
    expect(result.winner).toBe("player");
  });

  it("awards a timeout to the enemy with the greater aggregate HP ratio", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 9, attackDamage: 50_000, attackSpeed: 20_000 },
        { ...snapshot.units[1]!, position: 12, attackDamage: 10_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.reason).toBe("timeout");
    expect(result.winner).toBe("enemy");
  });

  it("compares multi-unit timeout scores exactly instead of rounding HP ratios", () => {
    const maxHp = 9_000_000_000_000_000;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, id: "enemy:E01:1", position: 10, maxHp, attackDamage: 1, attackSpeed: 20_000 },
        { ...snapshot.units[0]!, id: "enemy:E02:1", position: 11, maxHp, attackDamage: 0, attackSpeed: 0 },
        { ...snapshot.units[1]!, id: "player:H01:1", position: 14, maxHp, attackDamage: 2, attackSpeed: 20_000 },
        { ...snapshot.units[1]!, id: "player:H02:1", position: 15, maxHp, attackDamage: 0, attackSpeed: 0 },
      ],
    });

    // Player: (maxHp - 1) / maxHp + 1; enemy: (maxHp - 2) / maxHp + 1.
    expect(result.reason).toBe("timeout");
    expect(result.winner).toBe("player");
  });

  it("does not include a summoned unit in timeout scoring", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          attackDamage: 0,
          attackSpeed: 0,
          startingMana: 100_000,
          maxMana: 100_000,
          skill: {
            id: "S_SUMMON",
            castTimeTicks: 1,
            effects: [{
              id: "E_SUMMON",
              primitive: "summon",
              target: "self",
              summon: { id: "decoy", maxHp: 1_000_000, durationTicks: 20 },
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackDamage: 10_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "UNIT_SUMMONED" })]));
    expect(result.reason).toBe("timeout");
    expect(result.winner).toBe("player");
  });

  it("rejects duplicate unit IDs and occupied positions", () => {
    expect(() =>
      canonicalizeSnapshot({
        ...snapshot,
        units: [snapshot.units[0]!, { ...snapshot.units[1]!, id: "enemy:E01:1" }],
      }),
    ).toThrow(/Duplicate unit ID/);

    expect(() =>
      canonicalizeSnapshot({
        ...snapshot,
        units: [snapshot.units[1]!, { ...snapshot.units[1]!, id: "player:H02:1", position: 12 }],
      }),
    ).toThrow(/occupied/);
  });

  it("selects targets by path length, then HP, grid index and unit ID", () => {
    const target = selectNearestTarget(
      { id: "player:H01:1", side: "player", position: 9, currentHp: 100, attackRange: 1 },
      [
        { id: "enemy:E02:1", side: "enemy", position: 10, currentHp: 100, attackRange: 1 },
        { id: "enemy:E01:1", side: "enemy", position: 8, currentHp: 100, attackRange: 1 },
      ],
      [8, 10, 13],
    );

    expect(target?.id).toBe("enemy:E01:1");
  });

  it("moves one cell per tick along a deterministic path", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 9 },
        { ...snapshot.units[1]!, position: 14 },
      ],
    });

    expect(result.events.filter((event) => event.type === "UNIT_MOVED")).toEqual([
      expect.objectContaining({ sourceUnitId: "enemy:E01:1", payload: { from: 9, to: 10 } }),
    ]);
  });

  it("reduces physical damage by armor using integer math", () => {
    expect(resolveDamage(100_000, 20_000)).toBe(83_333);
    expect(resolveDamage(100_000, -50_000)).toBe(100_000);
  });

  it("attacks, grants mana and ends combat when a side is eliminated", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          maxHp: 100_000,
          attackDamage: 100_000,
          attackSpeed: 20_000,
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 80_000 },
      ],
    });

    expect(result.reason).toBe("elimination");
    expect(result.winner).toBe("enemy");
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "BASIC_ATTACK", sourceUnitId: "enemy:E01:1" }),
        expect.objectContaining({ type: "DAMAGE_APPLIED", payload: expect.objectContaining({ amount: 100_000 }) }),
        expect.objectContaining({ type: "UNIT_DIED", targetUnitId: "player:H01:1" }),
      ]),
    );
  });

  it("locks a target and blocks basic attacks while a skill is casting", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0 },
        {
          ...snapshot.units[1]!,
          position: 12,
          startingMana: 10_000,
          maxMana: 10_000,
          skill: { id: "S_TEST", castTimeTicks: 1 },
        },
      ],
    });

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "CAST_STARTED", sourceUnitId: "player:H01:1", targetUnitId: "enemy:E01:1" }),
        expect.objectContaining({ type: "CAST_RESOLVED", sourceUnitId: "player:H01:1", targetUnitId: "enemy:E01:1" }),
      ]),
    );
    expect(result.events.filter((event) => event.type === "BASIC_ATTACK" && event.sourceUnitId === "player:H01:1")).toHaveLength(0);
  });

  it("executes magic damage effects at cast resolution with resistance", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_MAGIC",
            castTimeTicks: 1,
            effects: [{
              id: "E_MAGIC",
              primitive: "deal_damage",
              target: "locked_target",
              baseValue: 100_000,
              damageType: "magic",
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 80_000, magicResist: 20_000, attackSpeed: 0 },
      ],
    });

    expect(result.reason).toBe("elimination");
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "EFFECT_APPLIED", payload: { effectId: "E_MAGIC", primitive: "deal_damage" } }),
        expect.objectContaining({ type: "DAMAGE_APPLIED", payload: expect.objectContaining({ amount: 83_333, damageType: "magic" }) }),
      ]),
    );
  });

  it("absorbs damage with a shield applied by a skill", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_SHIELD",
            castTimeTicks: 1,
            effects: [{ id: "E_SHIELD", primitive: "shield", target: "self", baseValue: 15_000, durationTicks: 20 }],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackDamage: 20_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "SHIELD_APPLIED", sourceUnitId: "enemy:E01:1" }),
        expect.objectContaining({ type: "DAMAGE_APPLIED", payload: expect.objectContaining({ amount: 5_000, mitigatedAmount: 20_000 }) }),
      ]),
    );
  });

  it("heals without exceeding max HP", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_HEAL",
            castTimeTicks: 1,
            effects: [{ id: "E_HEAL", primitive: "heal", target: "self", baseValue: 15_000 }],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackDamage: 20_000, attackSpeed: 20_000 },
      ],
    });

    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "HEAL_APPLIED", payload: { amount: 15_000, remainingHp: 95_000 } }),
      ]),
    );
  });

  it("prevents a stunned unit from acting later in the same tick", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_STUN",
            castTimeTicks: 1,
            effects: [{ id: "E_STUN", primitive: "stun", target: "locked_target", durationTicks: 20 }],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 20_000 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "STUN_APPLIED" })]));
    expect(result.events.filter((event) => event.type === "BASIC_ATTACK" && event.sourceUnitId === "player:H01:1")).toHaveLength(1);
  });

  it("applies damage over time on deterministic interval ticks", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_DOT",
            castTimeTicks: 1,
            effects: [{
              id: "E_DOT",
              primitive: "apply_dot",
              target: "locked_target",
              baseValue: 100_000,
              durationTicks: 3,
              intervalTicks: 1,
              damageType: "true",
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 80_000, attackSpeed: 0 },
      ],
    });

    expect(result.reason).toBe("elimination");
    expect(result.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ tick: 3, type: "DAMAGE_APPLIED", payload: expect.objectContaining({ damageType: "true" }) }),
      ]),
    );
  });

  it("uses a timed attack-damage buff for the next attack", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 20_000,
          skill: { id: "S_BUFF", castTimeTicks: 1, effects: [{
            id: "E_BUFF", primitive: "buff_stat", target: "self", stat: "attack_damage", modifierMode: "flat", baseValue: 100_000, durationTicks: 10,
          }] },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 80_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "STAT_MODIFIER_APPLIED" }),
      expect.objectContaining({ tick: 3, type: "DAMAGE_APPLIED", payload: expect.objectContaining({ amount: 105_000 }) }),
    ]));
  });

  it("slows deterministic movement", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0,
          skill: { id: "S_SLOW", castTimeTicks: 1, effects: [{
            id: "E_SLOW", primitive: "slow", target: "locked_target", baseValue: 500, durationTicks: 20,
          }] },
        },
        { ...snapshot.units[1]!, position: 14, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "SLOW_APPLIED" })]));
    expect(result.events.filter((event) => event.type === "UNIT_MOVED" && event.sourceUnitId === "player:H01:1")).toHaveLength(1);
  });

  it("dashes along a deterministic path", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        { ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0, skill: { id: "S_DASH", castTimeTicks: 1, effects: [{ id: "E_DASH", primitive: "dash", target: "self", distance: 1 }] } },
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });
    expect(result.events).toEqual(expect.arrayContaining([expect.objectContaining({ type: "UNIT_DISPLACED", sourceUnitId: "enemy:E01:1" })]));
  });

  it("expires a summoned decoy when its duration ends", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_SUMMON",
            castTimeTicks: 1,
            effects: [{
              id: "E_SUMMON",
              primitive: "summon",
              target: "self",
              summon: { id: "decoy", maxHp: 10_000, durationTicks: 1 },
            }],
          },
        },
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ tick: 3, type: "SUMMON_EXPIRED" }),
    ]));
  });

  it("enforces the shared summon cap across multiple casters", () => {
    const summonSkill = {
      id: "S_SUMMON",
      castTimeTicks: 1,
      effects: [{
        id: "E_SUMMON",
        primitive: "summon" as const,
        target: "self" as const,
        summon: { id: "decoy", maxHp: 10_000, durationTicks: 20 },
      }],
    };
    const enemy = (id: string, position: number) => ({
      ...snapshot.units[0]!,
      id,
      position,
      startingMana: 10_000,
      maxMana: 10_000,
      attackSpeed: 0,
      skill: summonSkill,
    });
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        enemy("enemy:E01:1", 0),
        enemy("enemy:E02:1", 2),
        enemy("enemy:E03:1", 6),
        enemy("enemy:E04:1", 8),
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events.filter((event) => event.type === "UNIT_SUMMONED")).toHaveLength(3);
  });

  it("cleanse removes an active damage-over-time effect", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_CLEANSE",
            castTimeTicks: 1,
            effects: [
              {
                id: "E_DOT",
                primitive: "apply_dot",
                target: "self",
                baseValue: 100_000,
                durationTicks: 10,
                intervalTicks: 1,
                damageType: "true",
                cleanseable: true,
              },
              { id: "E_CLEANSE", primitive: "cleanse", target: "self" },
            ],
          },
        },
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ type: "CLEANSE_APPLIED" }),
    ]));
    expect(result.events.filter((event) => event.type === "DAMAGE_APPLIED")).toHaveLength(0);
  });

  it("does not cleanse a damage-over-time effect without the cleanseable flag", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_UNCLEANSABLE_DOT",
            castTimeTicks: 1,
            effects: [
              {
                id: "E_UNCLEANSABLE_DOT",
                primitive: "apply_dot",
                target: "self",
                baseValue: 1_000,
                durationTicks: 10,
                intervalTicks: 1,
                damageType: "true",
                cleanseable: false,
              },
              { id: "E_CLEANSE", primitive: "cleanse", target: "self" },
            ],
          },
        },
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tick: 3,
        type: "DAMAGE_APPLIED",
        payload: expect.objectContaining({ amount: 1_000, damageType: "true" }),
      }),
    ]));
  });

  it("knocks a target away in the source-to-target direction", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_KNOCKBACK",
            castTimeTicks: 1,
            effects: [{
              id: "E_KNOCKBACK",
              primitive: "knockback",
              target: "locked_target",
              distance: 1,
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_DISPLACED",
        targetUnitId: "player:H01:1",
        payload: expect.objectContaining({ from: 12, to: 16 }),
      }),
    ]));
  });

  it("keeps a knockback-immune target in place while resolving the same generic effect", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_KNOCKBACK",
            castTimeTicks: 1,
            effects: [{
              id: "E_KNOCKBACK",
              primitive: "knockback",
              target: "locked_target",
              distance: 1,
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, moveSpeed: 1, attackSpeed: 0, immunities: ["knockback"] },
      ],
    });

    expect(result.events).not.toContainEqual(expect.objectContaining({
      type: "UNIT_DISPLACED",
      targetUnitId: "player:H01:1",
    }));
    expect(result.units.find((unit) => unit.id === "player:H01:1")?.position).toBe(12);
  });

  it("retreats one legal cell only when the caster is engaged with its locked target", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_RETREAT",
            castTimeTicks: 1,
            effects: [{
              id: "E_RETREAT",
              primitive: "retreat",
              target: "self",
              distance: 1,
              onlyWhenEngaged: true,
            } as CombatEffect],
          },
        },
        { ...snapshot.units[1]!, position: 13, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "UNIT_DISPLACED",
      sourceUnitId: "enemy:E01:1",
      targetUnitId: "enemy:E01:1",
      payload: { from: 9, to: 5 },
    }));
  });

  it("restores mana through a generic post-cast effect without exceeding max mana", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0,
          skill: {
            id: "S_MANA_RETURN", castTimeTicks: 1,
            effects: [{ id: "E_MANA_RETURN", primitive: "restore_mana", target: "self", baseValue: 20_000 } as CombatEffect],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "MANA_CHANGED", sourceUnitId: "enemy:E01:1", payload: { mana: 10_000, reason: "effect" },
    }));
  });

  it("reduces incoming damage while a timed generic damage-reduction effect is active", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0,
          skill: {
            id: "S_DAMAGE_REDUCTION", castTimeTicks: 1,
            effects: [{ id: "E_DAMAGE_REDUCTION", primitive: "damage_reduction", target: "self", baseValue: 500, durationTicks: 20 } as CombatEffect],
          },
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 20_000 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      tick: 2, type: "DAMAGE_APPLIED", sourceUnitId: "player:H01:1", targetUnitId: "enemy:E01:1",
      payload: expect.objectContaining({ amount: 2_500 }),
    }));
  });

  it("caps stacked adjacent-trait damage reductions at eight percent", () => {
    const dogPassive = (id: string): CombatPassive => ({
      ownerId: "R_DOG", triggerId: id, trigger: "on_combat_start" as const,
      effects: [{ id: "E_R_DOG_ADJACENT_REDUCTION", primitive: "damage_reduction", target: "nearest_trait_ally", baseValue: 40, durationTicks: 3_600, maxStacks: 2 }],
    });
    const dogMarker = { ownerId: "R_DOG", triggerId: "dog:marker", trigger: "on_basic_attack" as const, effects: [] };
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 20_000 },
        { ...snapshot.units[1]!, position: 13, attackSpeed: 0, passives: [dogMarker] },
        { ...snapshot.units[1]!, id: "player:H02:1", position: 14, attackSpeed: 0, passives: [dogPassive("dog:17")] },
        { ...snapshot.units[1]!, id: "player:H03:1", position: 16, attackSpeed: 0, passives: [dogPassive("dog:20")] },
        { ...snapshot.units[1]!, id: "player:H04:1", position: 18, attackSpeed: 0, passives: [dogPassive("dog:22")] },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "DAMAGE_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H01:1", payload: expect.objectContaining({ amount: 4_600 }),
    }));
  });

  it("fires one Dog death response that heals every surviving Dog by ten percent of its own max HP", () => {
    const dogDeathPassive = {
      ownerId: "R_DOG", triggerId: "T_R_DOG_5_FIRST_DEATH_HEAL", trigger: "on_death",
      oncePerOwnerPerCombat: true,
      effects: [{
        id: "E_R_DOG_5_SURVIVOR_HEAL", primitive: "heal", target: "all_trait_allies", baseValue: 100,
        scalesWithTargetMaxHp: true,
      }],
    } as unknown as CombatPassive;
    const dogMarker = { ownerId: "R_DOG", triggerId: "dog:marker", trigger: "on_basic_attack" as const, effects: [] };
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 11, attackSpeed: 0,
          passives: [{
            ownerId: "enemy:opening-strike", triggerId: "enemy:opening-strike", trigger: "on_combat_start",
            effects: [{ id: "E_ENEMY_OPENING_STRIKE", primitive: "deal_damage", target: "all_enemies", baseValue: 100_000, damageType: "true" }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 50_000, attackSpeed: 0, passives: [dogDeathPassive] },
        { ...snapshot.units[1]!, id: "player:H02:1", position: 13, maxHp: 50_000, attackSpeed: 0, passives: [dogDeathPassive] },
        { ...snapshot.units[1]!, id: "player:H03:1", position: 14, maxHp: 200_000, attackSpeed: 0, passives: [dogMarker] },
      ],
    });

    const dogHeals = result.events.filter((event) => event.type === "HEAL_APPLIED" && event.sourceUnitId === "player:H01:1");
    expect(dogHeals).toEqual([
      expect.objectContaining({ targetUnitId: "player:H02:1", payload: expect.objectContaining({ amount: 5_000 }) }),
      expect.objectContaining({ targetUnitId: "player:H03:1", payload: expect.objectContaining({ amount: 20_000 }) }),
    ]);
  });

  it("dispatches an on-kill passive to the unit that dealt lethal damage", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackDamage: 100_000, attackSpeed: 20_000,
          passives: [{
            ownerId: "C_FIGHTER", triggerId: "fighter:kill-speed", trigger: "on_kill" as "on_cast_resolve",
            effects: [{ id: "E_FIGHTER_KILL_SPEED", primitive: "buff_stat", target: "self", stat: "attack_speed", modifierMode: "percent", baseValue: 150, durationTicks: 80 }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 50_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "STAT_MODIFIER_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "enemy:E01:1",
      payload: { stat: "attack_speed", value: 150 },
    }));
  });

  it("gains capped stationary Ranger damage stacks at deterministic intervals", () => {
    const stationaryRangerPassive = {
      ownerId: "C_RANGER", triggerId: "ranger:stationary-damage", trigger: "on_stationary_interval",
      stationaryIntervalTicks: 2,
      effects: [{
        id: "E_RANGER_STATIONARY_DAMAGE", primitive: "buff_stat", target: "self", stat: "attack_damage",
        modifierMode: "percent", baseValue: 80, durationTicks: 100, maxStacks: 2, removeOnMove: true,
      }],
    } as unknown as CombatPassive;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 6,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0 },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0, attackRange: 1, passives: [stationaryRangerPassive] },
      ],
    });

    const rangerStacks = result.events.filter((event) => event.type === "STAT_MODIFIER_APPLIED" && event.payload.stat === "attack_damage");
    expect(rangerStacks).toHaveLength(2);
    expect(rangerStacks.map((event) => event.payload.value)).toEqual([80, 80]);
  });

  it("clears stationary Ranger damage stacks as soon as the holder moves", () => {
    const stationaryRangerPassive = {
      ownerId: "C_RANGER", triggerId: "ranger:move-reset", trigger: "on_stationary_interval",
      stationaryIntervalTicks: 1,
      effects: [{
        id: "E_RANGER_MOVE_RESET", primitive: "buff_stat", target: "self", stat: "attack_damage",
        modifierMode: "percent", baseValue: 80, durationTicks: 100, maxStacks: 2, removeOnMove: true,
      }],
    } as unknown as CombatPassive;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackSpeed: 0, startingMana: 100_000, maxMana: 100_000,
          skill: { id: "S_KNOCKBACK", castTimeTicks: 1, effects: [{ id: "E_KNOCKBACK", primitive: "knockback", target: "locked_target", distance: 1 }] },
        },
        { ...snapshot.units[1]!, position: 12, attackRange: 3, attackSpeed: 20_000, passives: [stationaryRangerPassive] },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      tick: 2, type: "DAMAGE_APPLIED", sourceUnitId: "player:H01:1", targetUnitId: "enemy:E01:1",
      payload: expect.objectContaining({ amount: 5_000 }),
    }));
  });

  it("sends a first Exotic basic-attack bounce to a different nearby enemy", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        {
          ...snapshot.units[0]!, position: 9, attackDamage: 10_000, attackSpeed: 20_000,
          passives: [{
            ownerId: "R_EXOTIC", triggerId: "exotic:first-bounce", trigger: "on_basic_attack", oncePerCombat: true,
            effects: [{ id: "E_EXOTIC_FIRST_BOUNCE", primitive: "deal_damage", target: "nearest_other_enemy", baseValue: 500, scalesWithAttackDamage: true, damageType: "physical" }],
          }],
        },
        { ...snapshot.units[1]!, position: 13, maxHp: 100_000, attackSpeed: 0 },
        { ...snapshot.units[1]!, id: "player:H02:1", position: 14, maxHp: 100_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "DAMAGE_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H02:1",
      payload: expect.objectContaining({ amount: 5_000 }),
    }));
  });

  it("dispatches a source passive to the unit just healed or shielded", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0,
          skill: { id: "S_SUPPORT_HEAL", castTimeTicks: 1, effects: [{ id: "E_SUPPORT_HEAL", primitive: "heal", target: "locked_target", baseValue: 1 }], },
          passives: [{
            ownerId: "C_SUPPORT", triggerId: "support:recipient-protection", trigger: "on_heal_or_shield" as "on_cast_resolve",
            effects: [{ id: "E_SUPPORT_PROTECTION", primitive: "damage_reduction", target: "locked_target", baseValue: 100, durationTicks: 60 }],
          }],
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "EFFECT_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H01:1",
      payload: { effectId: "E_SUPPORT_PROTECTION", primitive: "damage_reduction" },
    }));
  });

  it("amplifies a holder's heal and shield values with fixed-point support power", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!, position: 9, startingMana: 10_000, maxMana: 10_000, attackSpeed: 0, healShieldPower: 150,
          skill: { id: "S_AMPLIFIED_HEAL", castTimeTicks: 1, effects: [{ id: "E_AMPLIFIED_HEAL", primitive: "heal", target: "locked_target", baseValue: 10_000 }], },
        },
        { ...snapshot.units[1]!, position: 12, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "HEAL_APPLIED", sourceUnitId: "enemy:E01:1", targetUnitId: "player:H01:1", payload: expect.objectContaining({ amount: 11_500 }),
    }));
  });

  it("targets the allied unit immediately behind the source in its own formation", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0 },
        {
          ...snapshot.units[1]!,
          position: 12,
          attackSpeed: 0,
          passives: [{
            ownerId: "C_GUARDIAN", triggerId: "guardian:rear-shield", trigger: "on_combat_start",
            effects: [{ id: "E_GUARDIAN_REAR_SHIELD", primitive: "shield", target: "rear_ally", baseValue: 10_000, durationTicks: 100 } as CombatEffect],
          }],
        },
        { ...snapshot.units[1]!, id: "player:H02:1", position: 16, attackSpeed: 0 },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "SHIELD_APPLIED",
      sourceUnitId: "player:H01:1",
      targetUnitId: "player:H02:1",
      payload: expect.objectContaining({ amount: 10_000 }),
    }));
  });

  it("targets the nearest living ally carrying the same passive owner", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: [
        { ...snapshot.units[0]!, position: 9, attackSpeed: 0 },
        {
          ...snapshot.units[1]!, position: 12, attackSpeed: 0,
          passives: [{
            ownerId: "R_DOG", triggerId: "dog:aid", trigger: "on_combat_start",
            effects: [{ id: "E_DOG_AID", primitive: "buff_stat", target: "nearest_trait_ally", stat: "attack_speed", modifierMode: "percent", baseValue: 150, durationTicks: 80 } as CombatEffect],
          }],
        },
        {
          ...snapshot.units[1]!, id: "player:H02:1", position: 15, attackSpeed: 0,
          passives: [{ ownerId: "R_DOG", triggerId: "dog:recipient", trigger: "on_hp_below", thresholdPercent: 500, oncePerCombat: true, effects: [] }],
        },
      ],
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "STAT_MODIFIER_APPLIED",
      sourceUnitId: "player:H01:1",
      targetUnitId: "player:H02:1",
      payload: expect.objectContaining({ stat: "attack_speed", value: 150 }),
    }));
  });

  it("removes an expired stat buff before the next attack", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 20_000,
          skill: {
            id: "S_SHORT_BUFF",
            castTimeTicks: 1,
            effects: [{
              id: "E_SHORT_BUFF",
              primitive: "buff_stat",
              target: "self",
              stat: "attack_damage",
              modifierMode: "flat",
              baseValue: 100_000,
              durationTicks: 1,
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 300_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tick: 3,
        type: "DAMAGE_APPLIED",
        payload: expect.objectContaining({ amount: 5_000 }),
      }),
    ]));
  });

  it("cleanse reverses an active stat debuff", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 20_000,
          skill: {
            id: "S_SELF_CLEANSE",
            castTimeTicks: 1,
            effects: [
              {
                id: "E_DEBUFF",
                primitive: "debuff_stat",
                target: "self",
                stat: "attack_damage",
                modifierMode: "flat",
                baseValue: 4_000,
                durationTicks: 20,
                cleanseable: true,
              },
              { id: "E_CLEANSE", primitive: "cleanse", target: "self" },
            ],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 100_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tick: 3,
        type: "DAMAGE_APPLIED",
        payload: expect.objectContaining({ amount: 5_000 }),
      }),
    ]));
  });

  it("applies a percent attack-damage buff relative to the current stat", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 20_000,
          skill: {
            id: "S_PERCENT_BUFF",
            castTimeTicks: 1,
            effects: [{
              id: "E_PERCENT_BUFF",
              primitive: "buff_stat",
              target: "self",
              stat: "attack_damage",
              modifierMode: "percent",
              baseValue: 500,
              durationTicks: 10,
            }],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 100_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tick: 3,
        type: "DAMAGE_APPLIED",
        payload: expect.objectContaining({ amount: 7_500 }),
      }),
    ]));
  });

  it("dashes the requested number of cells along the target path", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_LONG_DASH",
            castTimeTicks: 1,
            effects: [{ id: "E_LONG_DASH", primitive: "dash", target: "self", distance: 2 }],
          },
        },
        { ...snapshot.units[1]!, position: 14, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_DISPLACED",
        sourceUnitId: "enemy:E01:1",
        payload: expect.objectContaining({ from: 9, to: 10 }),
      }),
    ]));
  });

  it("knocks a target back the requested number of cells", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 2,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 0,
          skill: {
            id: "S_LONG_KNOCKBACK",
            castTimeTicks: 1,
            effects: [{ id: "E_LONG_KNOCKBACK", primitive: "knockback", target: "locked_target", distance: 2 }],
          },
        },
        { ...snapshot.units[1]!, position: 12, moveSpeed: 1, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        type: "UNIT_DISPLACED",
        targetUnitId: "player:H01:1",
        payload: expect.objectContaining({ from: 12, to: 20 }),
      }),
    ]));
  });

  it("refreshes a repeated stat modifier instead of stacking it", () => {
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: [
        {
          ...snapshot.units[0]!,
          position: 9,
          startingMana: 10_000,
          maxMana: 10_000,
          attackSpeed: 20_000,
          skill: {
            id: "S_REFRESH_BUFF",
            castTimeTicks: 1,
            effects: [
              {
                id: "E_REFRESH_BUFF",
                primitive: "buff_stat",
                target: "self",
                stat: "attack_damage",
                modifierMode: "flat",
                baseValue: 1_000,
                durationTicks: 10,
              },
              {
                id: "E_REFRESH_BUFF",
                primitive: "buff_stat",
                target: "self",
                stat: "attack_damage",
                modifierMode: "flat",
                baseValue: 1_000,
                durationTicks: 10,
              },
            ],
          },
        },
        { ...snapshot.units[1]!, position: 12, maxHp: 100_000, attackSpeed: 0 },
      ],
    });

    expect(result.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        tick: 3,
        type: "DAMAGE_APPLIED",
        payload: expect.objectContaining({ amount: 6_000 }),
      }),
    ]));
  });

  it("completes one thousand seeded simulations without a replay desync", () => {
    for (let index = 0; index < 1_000; index += 1) {
      const input = { ...snapshot, combatId: `stress-${index}`, combatSeed: `stress-seed-${index}`, maxTicks: 35 };
      const first = runHeadlessCombat(input);
      const replay = runHeadlessCombat({ ...input, units: [...input.units].reverse() });

      expect(replay.resultHash).toBe(first.resultHash);
      expect(replay.events).toEqual(first.events);
      expect(first.events.at(-1)).toMatchObject({ type: "COMBAT_ENDED" });
    }
  });
});
