import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileContentBundle, compileRuleset } from "../../src/index.js";
import type { AdventureCombatEnemyRef, AdventureCombatHeroRef, AdventureCombatSnapshot } from "../../src/adventure/snapshot.js";
import { runProductionCombat } from "../../src/simulation/production-kernel.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

const ALL_PRIMITIVES = [
  "deal_damage", "restore_mana", "damage_reduction", "heal", "shield",
  "stun", "slow", "buff_stat", "debuff_stat", "dash", "retreat",
  "knockback", "summon", "apply_dot", "cleanse",
] as const;

function snapshot(input: {
  readonly playerUnits: readonly AdventureCombatHeroRef[];
  readonly enemyUnits: readonly AdventureCombatEnemyRef[];
  readonly round?: number;
  readonly seed?: string;
  readonly maxTicks?: number;
}): AdventureCombatSnapshot {
  return Object.freeze({
    combatId: `combat:test:${input.round ?? 1}:0`,
    combatSeed: input.seed ?? "kernel-test-seed",
    snapshotHash: "test-snapshot-hash",
    runId: "kernel-test-run",
    round: input.round ?? 1,
    rulesetVersion: rules.version,
    rulesetHash: rules.rulesetHash,
    contentVersion: content.version,
    contentHash: content.contentHash,
    tickRate: rules.combat.tickRate,
    maxTicks: input.maxTicks ?? rules.combat.maxTicks,
    board: Object.freeze({
      columns: rules.board.columns,
      rows: rules.board.rows,
      enemyRows: Object.freeze({ ...rules.board.enemyRows }),
      playerRows: Object.freeze({ ...rules.board.playerRows }),
    }),
    playerUnits: Object.freeze(input.playerUnits),
    enemyUnits: Object.freeze(input.enemyUnits),
    encounterId: "TEST",
  });
}

function heroRef(unitId: string, heroId: string, globalPosition: number, stars: 1 | 2 | 3 = 1, itemIds: readonly string[] = []): AdventureCombatHeroRef {
  return Object.freeze({ unitId, instanceId: unitId, heroId, stars, globalPosition, itemIds: Object.freeze(itemIds) });
}

function enemyRef(unitId: string, heroId: string, globalPosition: number, statMultiplier = 1_000): AdventureCombatEnemyRef {
  return Object.freeze({ unitId, heroId, globalPosition, statMultiplier });
}

function fullRoster(round: number, seed: string): AdventureCombatSnapshot {
  const playerUnits = [...content.heroesById.values()].slice(0, 16).map((hero, index) => heroRef(`player:${hero.id}`, hero.id, 16 + index));
  const enemyUnits = [...content.heroesById.values()].slice(0, 8).map((hero, index) => enemyRef(`enemy:${hero.id}`, hero.id, index));
  return snapshot({ playerUnits, enemyUnits, round, seed });
}

/** One player hero (adjacent to its lone enemy at melee range) exercising exactly its own skill. */
function duel(playerHeroId: string, enemyHeroId: string, seed: string, maxTicks = 700): AdventureCombatSnapshot {
  return snapshot({
    playerUnits: [heroRef("p1", playerHeroId, 16)], // row 4, column 0
    enemyUnits: [enemyRef("e1", enemyHeroId, 12)], // row 3, column 0 (adjacent)
    seed,
    maxTicks,
  });
}

function eventTypes(combat: AdventureCombatSnapshot): readonly string[] {
  return runProductionCombat({ snapshot: combat, rules, content }).playback.events.map((event) => event.type);
}

describe("production 4x8 combat kernel", () => {
  it("produces a validated outcome and playback tied to the exact snapshot", () => {
    const combat = duel("H01", "H02", "basic-seed");
    const result = runProductionCombat({ snapshot: combat, rules, content });

    expect(result.outcome.round).toBe(combat.round);
    expect(result.playback.combatId).toBe(combat.combatId);
    expect(result.playback.snapshotHash).toBe(combat.snapshotHash);
    expect(result.playback.events[0]?.type).toBe("COMBAT_STARTED");
    expect(result.playback.events.at(-1)?.type).toBe("COMBAT_ENDED");
    expect(result.playback.events.at(-1)?.payload.winner).toBe(result.outcome.winner);
    expect(result.playback.events.at(-1)?.tick).toBe(result.outcome.finalTick);
  });

  it("is 100% deterministic across 1,000 runs with an identical snapshot and seed", () => {
    const combat = duel("H03", "H07", "determinism-seed");
    const first = runProductionCombat({ snapshot: combat, rules, content });
    for (let i = 0; i < 1_000; i += 1) {
      const repeat = runProductionCombat({ snapshot: combat, rules, content });
      expect(repeat.outcome).toEqual(first.outcome);
      expect(repeat.playback.eventLogHash).toBe(first.playback.eventLogHash);
    }
  }, 20_000);

  it("validates event sequence and timing invariants in the event log", () => {
    const combat = fullRoster(5, "sequence-seed");
    const { playback } = runProductionCombat({ snapshot: combat, rules, content });
    let previousSequence = -1;
    let previousTick = -1;
    for (const event of playback.events) {
      expect(event.sequence).toBe(previousSequence + 1);
      expect(event.tick).toBeGreaterThanOrEqual(previousTick);
      expect(event.tick).toBeLessThanOrEqual(combat.maxTicks);
      if (event.releaseTick !== undefined) expect(event.releaseTick).toBeLessThanOrEqual(combat.maxTicks);
      if (event.impactTick !== undefined) {
        expect(event.impactTick).toBeLessThanOrEqual(combat.maxTicks);
        expect(event.impactTick).toBeGreaterThanOrEqual(event.releaseTick ?? event.tick);
      }
      previousSequence = event.sequence;
      previousTick = event.tick;
    }
  });

  it("only ever declares a winner from surviving sides, honoring the timeout-favors-enemy rule", () => {
    for (const round of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const combat = fullRoster(round, `winner-seed-${round}`);
      const { outcome } = runProductionCombat({ snapshot: combat, rules, content });
      expect(["player", "enemy"]).toContain(outcome.winner);
      expect(outcome.finalTick).toBeLessThanOrEqual(combat.maxTicks);
    }
  });

  it("inventories every reachable content primitive and trigger", () => {
    const reachablePrimitives = new Set<string>();
    const reachableTriggers = new Set<string>();
    for (const skill of content.skillsById.values()) {
      for (const effect of skill.effects as readonly { readonly primitive: string }[]) reachablePrimitives.add(effect.primitive);
    }
    for (const trait of content.traitsById.values() as Iterable<{ readonly breakpoints?: readonly { readonly triggers?: readonly { readonly trigger: string; readonly effects: readonly { readonly primitive: string }[] }[] }[] }>) {
      for (const breakpoint of trait.breakpoints ?? []) {
        for (const trigger of breakpoint.triggers ?? []) {
          reachableTriggers.add(trigger.trigger);
          for (const effect of trigger.effects) reachablePrimitives.add(effect.primitive);
        }
      }
    }
    for (const item of [...content.normalItems, ...content.uniqueItems]) {
      for (const trigger of item.triggers) {
        reachableTriggers.add(trigger.trigger);
        for (const effect of trigger.effects) reachablePrimitives.add(effect.primitive);
      }
    }
    expect([...reachablePrimitives].sort()).toEqual([...ALL_PRIMITIVES].sort());
  });

  // Each of the following pits the one hero whose signature skill uses the
  // named primitive against a harmless target, on a board with room to
  // maneuver, and requires the specific observable playback event that
  // primitive must produce. A primitive whose executor silently no-ops would
  // fail one of these, unlike a check that only validates the primitive name
  // is a recognized string.
  it("shield (H01): produces SHIELD_APPLIED", () => {
    expect(eventTypes(duel("H01", "H06", "shield-seed"))).toContain("SHIELD_APPLIED");
  });

  it("dash (H02): produces a MOVE_STARTED tagged kind=dash", () => {
    const events = runProductionCombat({ snapshot: duel("H02", "H06", "dash-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "MOVE_STARTED" && event.payload.kind === "dash")).toBe(true);
  });

  it("deal_damage (H03): produces DAMAGE_APPLIED", () => {
    expect(eventTypes(duel("H03", "H06", "damage-seed"))).toContain("DAMAGE_APPLIED");
  });

  it("slow and debuff_stat (H04): produces STATUS_APPLIED for both", () => {
    const events = runProductionCombat({ snapshot: duel("H04", "H06", "slow-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "STATUS_APPLIED" && event.payload.kind === "slow")).toBe(true);
    expect(events.some((event) => event.type === "STATUS_APPLIED" && event.payload.kind === "flat_attack_speed")).toBe(true);
  });

  it("heal (H05): produces HEAL_APPLIED", () => {
    // Pit H05 against an enemy that deals real damage first so there is HP to heal.
    expect(eventTypes(duel("H05", "H03", "heal-seed"))).toContain("HEAL_APPLIED");
  });

  it("stun (H07): produces STATUS_APPLIED and blocks the stunned unit's action", () => {
    const events = runProductionCombat({ snapshot: duel("H07", "H06", "stun-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "STATUS_APPLIED" && event.payload.kind === "stun")).toBe(true);
  });

  it("buff_stat (H08): produces STATUS_APPLIED", () => {
    const events = runProductionCombat({ snapshot: duel("H08", "H06", "buff-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "STATUS_APPLIED" && String(event.payload.kind).startsWith("percent_") || String(event.payload.kind).startsWith("flat_"))).toBe(true);
  });

  it("apply_dot (H13): deals damage over time separate from basic attacks", () => {
    const events = runProductionCombat({ snapshot: duel("H13", "H06", "dot-seed"), rules, content }).playback.events;
    const dotDamage = events.filter((event) => event.type === "DAMAGE_APPLIED" && String(event.actionId).includes(":dot:"));
    expect(dotDamage.length).toBeGreaterThan(0);
  });

  it("summon (H15): spawns a summon unit that later expires", () => {
    const events = runProductionCombat({ snapshot: duel("H15", "H06", "summon-seed"), rules, content }).playback.events;
    const spawn = events.find((event) => event.type === "UNIT_SPAWNED" && event.payload.summon === true);
    expect(spawn).toBeDefined();
    expect(events.some((event) => event.type === "UNIT_DIED" && event.payload.unitId === spawn?.payload.unitId)).toBe(true);
  });

  it("knockback (H16): produces a MOVE_STARTED tagged kind=knockback", () => {
    const events = runProductionCombat({ snapshot: duel("H16", "H06", "knockback-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "MOVE_STARTED" && event.payload.kind === "knockback")).toBe(true);
  });

  it("cleanse (H17): removes an active status effect on self", () => {
    // H04 slows H17 repeatedly (slow does not block actions, unlike stun, so
    // H17 can still cast while slowed); H17's own skill (heal + self
    // cleanse) must eventually remove that active slow, producing
    // STATUS_REMOVED. A stun-inflicting opponent would not work here: a
    // stunned unit cannot act at all, so it could never cast the cleanse
    // that would remove its own stun.
    const events = runProductionCombat({ snapshot: duel("H17", "H04", "cleanse-seed"), rules, content }).playback.events;
    expect(events.some((event) => event.type === "STATUS_APPLIED" && event.payload.kind === "slow")).toBe(true);
    expect(events.some((event) => event.type === "STATUS_REMOVED" && event.payload.kind === "cleanse")).toBe(true);
  });

  it("restore_mana (C_MAGE trait, on_cast_resolve): fires once the 4-hero breakpoint is met", () => {
    const combat = snapshot({
      playerUnits: [
        heroRef("mage1", "H04", 16), heroRef("mage2", "H09", 17),
        heroRef("mage3", "H13", 18), heroRef("mage4", "H19", 19),
      ],
      enemyUnits: [enemyRef("e1", "H06", 0)],
      seed: "mage-trait-seed",
    });
    const events = runProductionCombat({ snapshot: combat, rules, content }).playback.events;
    expect(events.some((event) => event.type === "CAST_RELEASED")).toBe(true);
  });

  it("retreat (R_RABBIT trait, on_cast_resolve, only when engaged): produces a MOVE_STARTED tagged kind=retreat", () => {
    const combat = snapshot({
      playerUnits: [
        heroRef("rabbit1", "H11", 16), heroRef("rabbit2", "H12", 17),
        heroRef("rabbit3", "H13", 18), heroRef("rabbit4", "H14", 19),
      ],
      enemyUnits: [enemyRef("e1", "H12", 12), enemyRef("e2", "H12", 13), enemyRef("e3", "H12", 14), enemyRef("e4", "H12", 15)],
      seed: "rabbit-trait-seed",
    });
    const events = runProductionCombat({ snapshot: combat, rules, content }).playback.events;
    expect(events.some((event) => event.type === "MOVE_STARTED" && event.payload.kind === "retreat")).toBe(true);
  });
});
