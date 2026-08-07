import type { AdventureCommand } from "./reducer.js";
import type {
  AdventureCombatResolutionCommand,
  AdventurePlaybackAckCommand,
  AdventureRewardClaimCommand,
} from "./lifecycle.js";
import type { AdventureCombatPlayback } from "./playback.js";
import type { AdventureSession } from "./session.js";
import type { AdventureView } from "./view.js";

export type AdventureRuntimeRequest =
  | AdventureCommand
  | AdventureCombatResolutionCommand
  | AdventurePlaybackAckCommand
  | AdventureRewardClaimCommand;

export interface AdventureRuntimeResponse {
  readonly revision: number;
  readonly replayed: boolean;
  readonly view: AdventureView;
  readonly playback?: AdventureCombatPlayback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function record(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function string(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function integer(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function exactKeys(raw: Record<string, unknown>, keys: readonly string[], type: string): void {
  const expected = [...keys].sort();
  const actual = Object.keys(raw).sort();
  if (actual.join(",") !== expected.join(",")) {
    throw new Error(`Adventure runtime ${type} fields must be exactly ${expected.join(",")}`);
  }
}

function base(raw: Record<string, unknown>) {
  return {
    commandId: string(raw.commandId, "commandId"),
    expectedRevision: integer(raw.expectedRevision, "expectedRevision"),
  };
}

function destination(value: unknown) {
  const raw = record(value, "destination");
  exactKeys(raw, ["kind", "index"], "destination");
  const kind = string(raw.kind, "destination.kind");
  if (kind !== "board" && kind !== "bench") throw new Error("destination.kind must be board or bench");
  return Object.freeze({ kind, index: integer(raw.index, "destination.index") });
}

function rewardSelections(value: unknown) {
  if (!Array.isArray(value)) throw new Error("selections must be an array");
  return Object.freeze(value.map((entry, index) => {
    const raw = record(entry, `selections[${index}]`);
    exactKeys(raw, ["offerId", "optionId"], "reward selection");
    return Object.freeze({
      offerId: string(raw.offerId, `selections[${index}].offerId`),
      optionId: string(raw.optionId, `selections[${index}].optionId`),
    });
  }));
}

export function parseAdventureRuntimeRequest(value: unknown): AdventureRuntimeRequest {
  const raw = record(value, "Adventure runtime request");
  const type = string(raw.type, "type");
  const common = base(raw);
  switch (type) {
    case "REFRESH_SHOP":
    case "LOCK_SHOP":
    case "BUY_XP":
    case "START_ROUND":
    case "RESOLVE_COMBAT":
    case "ACK_PLAYBACK_COMPLETE":
      exactKeys(raw, ["commandId", "expectedRevision", "type"], type);
      return Object.freeze({ ...common, type });
    case "BUY_SHOP_HERO":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "shopSlotIndex"], type);
      return Object.freeze({ ...common, type, shopSlotIndex: integer(raw.shopSlotIndex, "shopSlotIndex") });
    case "MOVE_HERO":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "heroInstanceId", "destination"], type);
      return Object.freeze({
        ...common,
        type,
        heroInstanceId: string(raw.heroInstanceId, "heroInstanceId"),
        destination: destination(raw.destination),
      });
    case "SELL_HERO":
    case "CLAIM_REWARD_HERO":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "heroInstanceId"], type);
      return Object.freeze({ ...common, type, heroInstanceId: string(raw.heroInstanceId, "heroInstanceId") });
    case "EQUIP_ITEM":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "itemInstanceId", "heroInstanceId"], type);
      return Object.freeze({
        ...common,
        type,
        itemInstanceId: string(raw.itemInstanceId, "itemInstanceId"),
        heroInstanceId: string(raw.heroInstanceId, "heroInstanceId"),
      });
    case "UNEQUIP_ITEM":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "itemInstanceId"], type);
      return Object.freeze({ ...common, type, itemInstanceId: string(raw.itemInstanceId, "itemInstanceId") });
    case "CLAIM_ROUND_REWARD":
      exactKeys(raw, ["commandId", "expectedRevision", "type", "selections"], type);
      return Object.freeze({ ...common, type, selections: rewardSelections(raw.selections) });
    default:
      throw new Error(`Unsupported Adventure runtime request type: ${type}`);
  }
}

export async function handleAdventureRuntimeRequest(
  session: AdventureSession,
  value: unknown,
): Promise<AdventureRuntimeResponse> {
  const request = parseAdventureRuntimeRequest(value);
  if (request.type === "RESOLVE_COMBAT") {
    const result = await session.resolveCombat(request);
    return Object.freeze({
      revision: result.revision,
      replayed: result.replayed,
      view: session.view,
      playback: result.playback,
    });
  }
  const result = request.type === "CLAIM_ROUND_REWARD"
    ? await session.claimReward(request)
    : request.type === "ACK_PLAYBACK_COMPLETE"
      ? await session.ackPlaybackComplete(request)
      : await session.dispatch(request);
  return Object.freeze({
    revision: result.revision,
    replayed: result.replayed,
    view: session.view,
  });
}
