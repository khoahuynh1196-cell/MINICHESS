import { describe, expect, it } from "vitest";
import {
  assertAdventureCombatPlayback,
  createAdventureCombatPlayback,
  validateAdventurePlaybackEvents,
  type AdventureCombatSnapshot,
  type AdventurePlaybackEvent,
} from "../../src/index.js";

const snapshot: AdventureCombatSnapshot = Object.freeze({
  combatId: "combat:playback:1:3",
  combatSeed: "a".repeat(64),
  snapshotHash: "b".repeat(64),
  runId: "playback-run",
  round: 1,
  rulesetVersion: "production-rules-0.1.0",
  rulesetHash: "c".repeat(64),
  contentVersion: "alpha-0.3.0",
  contentHash: "d".repeat(16),
  tickRate: 20,
  maxTicks: 700,
  board: Object.freeze({
    columns: 4,
    rows: 8,
    enemyRows: Object.freeze({ start: 0, end: 3 }),
    playerRows: Object.freeze({ start: 4, end: 7 }),
  }),
  playerUnits: Object.freeze([]),
  enemyUnits: Object.freeze([]),
  encounterId: "E01",
});

const events: readonly AdventurePlaybackEvent[] = Object.freeze([
  Object.freeze({ sequence: 0, tick: 0, type: "COMBAT_STARTED", payload: Object.freeze({ round: 1 }) }),
  Object.freeze({
    sequence: 1,
    tick: 10,
    type: "ATTACK_STARTED",
    actionId: "attack:1",
    sourceUnitId: "player:hero-a",
    targetUnitId: "enemy:one",
    sourcePosition: 31,
    targetPosition: 0,
    animationKey: "basic_attack",
    releaseTick: 12,
    impactTick: 16,
    payload: Object.freeze({}),
  }),
  Object.freeze({
    sequence: 2,
    tick: 16,
    type: "DAMAGE_APPLIED",
    actionId: "attack:1",
    sourceUnitId: "player:hero-a",
    targetUnitId: "enemy:one",
    targetPosition: 0,
    impactTick: 16,
    payload: Object.freeze({ amount: 1000, remainingHp: 0 }),
  }),
  Object.freeze({ sequence: 3, tick: 17, type: "COMBAT_ENDED", payload: Object.freeze({ winner: "player" }) }),
]);

describe("deterministic combat playback", () => {
  it("creates a frozen playback with a stable event-log hash", () => {
    const first = createAdventureCombatPlayback(snapshot, events);
    const second = createAdventureCombatPlayback(snapshot, events.map((event) => ({ ...event })));

    expect(second).toEqual(first);
    expect(first.eventLogHash).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.events)).toBe(true);
    expect(() => assertAdventureCombatPlayback(first, snapshot)).not.toThrow();
  });

  it("rejects non-contiguous sequence and regressing ticks", () => {
    const badSequence = events.map((event, index) => index === 1 ? { ...event, sequence: 4 } : event);
    expect(() => validateAdventurePlaybackEvents(snapshot, badSequence))
      .toThrow("Adventure playback sequence must be contiguous at 1");

    const badTick = events.map((event, index) => index === 2 ? { ...event, tick: 9 } : event);
    expect(() => validateAdventurePlaybackEvents(snapshot, badTick))
      .toThrow("Adventure playback tick order regressed at 2");
  });

  it("rejects invalid release, impact, and board positions", () => {
    const earlyImpact = events.map((event, index) => index === 1
      ? { ...event, releaseTick: 12, impactTick: 11 }
      : event);
    expect(() => validateAdventurePlaybackEvents(snapshot, earlyImpact))
      .toThrow("Adventure playback impactTick is invalid at 1");

    const invalidPosition = events.map((event, index) => index === 1
      ? { ...event, sourcePosition: 32 }
      : event);
    expect(() => validateAdventurePlaybackEvents(snapshot, invalidPosition))
      .toThrow("events[1].sourcePosition must be within the board");
  });

  it("rejects missing start/end events and ticks beyond combat bounds", () => {
    expect(() => validateAdventurePlaybackEvents(snapshot, events.slice(1)))
      .toThrow("Adventure playback must start with COMBAT_STARTED");
    expect(() => validateAdventurePlaybackEvents(snapshot, events.slice(0, -1)))
      .toThrow("Adventure playback must end with COMBAT_ENDED");
    const tooLate = events.map((event, index) => index === 3 ? { ...event, tick: 701 } : event);
    expect(() => validateAdventurePlaybackEvents(snapshot, tooLate))
      .toThrow("Adventure playback tick exceeds maxTicks at 3");
  });

  it("rejects mismatched snapshot identity and tampered event hashes", () => {
    const playback = createAdventureCombatPlayback(snapshot, events);
    expect(() => assertAdventureCombatPlayback({ ...playback, snapshotHash: "e".repeat(64) }, snapshot))
      .toThrow("ADVENTURE_PLAYBACK_SNAPSHOT_MISMATCH");
    expect(() => assertAdventureCombatPlayback({ ...playback, eventLogHash: "f".repeat(64) }, snapshot))
      .toThrow("ADVENTURE_PLAYBACK_HASH_MISMATCH");
  });
});
