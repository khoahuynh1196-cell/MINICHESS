import { sha256Hex, stableStringify } from "../serialization/canonical-json.js";
import type { AdventureCombatSnapshot } from "./snapshot.js";

export type AdventurePlaybackEventType =
  | "COMBAT_STARTED"
  | "UNIT_SPAWNED"
  | "MOVE_STARTED"
  | "MOVE_COMPLETED"
  | "ATTACK_STARTED"
  | "PROJECTILE_RELEASED"
  | "CAST_STARTED"
  | "CAST_RELEASED"
  | "DAMAGE_APPLIED"
  | "HEAL_APPLIED"
  | "SHIELD_APPLIED"
  | "STATUS_APPLIED"
  | "STATUS_REMOVED"
  | "UNIT_DIED"
  | "COMBAT_ENDED";

export interface AdventurePlaybackEvent {
  readonly sequence: number;
  readonly tick: number;
  readonly type: AdventurePlaybackEventType;
  readonly actionId?: string;
  readonly sourceUnitId?: string;
  readonly targetUnitId?: string;
  readonly sourcePosition?: number;
  readonly targetPosition?: number;
  readonly animationKey?: string;
  readonly releaseTick?: number;
  readonly impactTick?: number;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface AdventureCombatPlayback {
  readonly combatId: string;
  readonly snapshotHash: string;
  readonly eventLogHash: string;
  readonly tickRate: number;
  readonly maxTicks: number;
  readonly events: readonly AdventurePlaybackEvent[];
}

function safeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
}

function optionalNonEmpty(value: string | undefined, label: string): void {
  if (value !== undefined && value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function optionalPosition(value: number | undefined, label: string, boardCells: number): void {
  if (value === undefined) return;
  safeInteger(value, label);
  if (value >= boardCells) throw new Error(`${label} must be within the board`);
}

export function validateAdventurePlaybackEvents(
  snapshot: AdventureCombatSnapshot,
  events: readonly AdventurePlaybackEvent[],
): void {
  if (events.length < 2) throw new Error("Adventure playback requires start and end events");
  if (events[0]?.type !== "COMBAT_STARTED") throw new Error("Adventure playback must start with COMBAT_STARTED");
  if (events.at(-1)?.type !== "COMBAT_ENDED") throw new Error("Adventure playback must end with COMBAT_ENDED");
  const boardCells = snapshot.board.columns * snapshot.board.rows;
  let previousTick = -1;
  for (const [index, event] of events.entries()) {
    safeInteger(event.sequence, `events[${index}].sequence`);
    if (event.sequence !== index) throw new Error(`Adventure playback sequence must be contiguous at ${index}`);
    safeInteger(event.tick, `events[${index}].tick`);
    if (event.tick < previousTick) throw new Error(`Adventure playback tick order regressed at ${index}`);
    if (event.tick > snapshot.maxTicks) throw new Error(`Adventure playback tick exceeds maxTicks at ${index}`);
    previousTick = event.tick;
    optionalNonEmpty(event.actionId, `events[${index}].actionId`);
    optionalNonEmpty(event.sourceUnitId, `events[${index}].sourceUnitId`);
    optionalNonEmpty(event.targetUnitId, `events[${index}].targetUnitId`);
    optionalNonEmpty(event.animationKey, `events[${index}].animationKey`);
    optionalPosition(event.sourcePosition, `events[${index}].sourcePosition`, boardCells);
    optionalPosition(event.targetPosition, `events[${index}].targetPosition`, boardCells);
    if (event.releaseTick !== undefined) {
      safeInteger(event.releaseTick, `events[${index}].releaseTick`);
      if (event.releaseTick < event.tick || event.releaseTick > snapshot.maxTicks) {
        throw new Error(`Adventure playback releaseTick is invalid at ${index}`);
      }
    }
    if (event.impactTick !== undefined) {
      safeInteger(event.impactTick, `events[${index}].impactTick`);
      if (event.impactTick < (event.releaseTick ?? event.tick) || event.impactTick > snapshot.maxTicks) {
        throw new Error(`Adventure playback impactTick is invalid at ${index}`);
      }
    }
    stableStringify(event.payload);
  }
}

export function createAdventureCombatPlayback(
  snapshot: AdventureCombatSnapshot,
  events: readonly AdventurePlaybackEvent[],
): AdventureCombatPlayback {
  validateAdventurePlaybackEvents(snapshot, events);
  const frozenEvents = Object.freeze(events.map((event) => Object.freeze({
    ...event,
    payload: Object.freeze({ ...event.payload }),
  })));
  return Object.freeze({
    combatId: snapshot.combatId,
    snapshotHash: snapshot.snapshotHash,
    eventLogHash: sha256Hex(frozenEvents),
    tickRate: snapshot.tickRate,
    maxTicks: snapshot.maxTicks,
    events: frozenEvents,
  });
}

export function assertAdventureCombatPlayback(
  playback: AdventureCombatPlayback,
  snapshot: AdventureCombatSnapshot,
): void {
  if (playback.combatId !== snapshot.combatId) throw new Error("ADVENTURE_PLAYBACK_COMBAT_MISMATCH");
  if (playback.snapshotHash !== snapshot.snapshotHash) throw new Error("ADVENTURE_PLAYBACK_SNAPSHOT_MISMATCH");
  if (playback.tickRate !== snapshot.tickRate || playback.maxTicks !== snapshot.maxTicks) {
    throw new Error("ADVENTURE_PLAYBACK_TIMING_MISMATCH");
  }
  validateAdventurePlaybackEvents(snapshot, playback.events);
  if (playback.eventLogHash !== sha256Hex(playback.events)) throw new Error("ADVENTURE_PLAYBACK_HASH_MISMATCH");
}
