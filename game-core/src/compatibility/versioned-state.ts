import { CANONICAL_RULESET_VERSION, CANONICAL_CONTENT_VERSION } from "../rules/board-contract.js";
import { migrateLegacyBoard4x8, migrateLegacyPosition4x8 } from "./legacy-board-migration.js";

export type VersionedStateResult =
  | { readonly kind: "CANONICAL"; readonly version: typeof CANONICAL_RULESET_VERSION; readonly contentVersion: typeof CANONICAL_CONTENT_VERSION; readonly view: Record<string, unknown> }
  | { readonly kind: "MIGRATED"; readonly sourceVersion: string; readonly targetVersion: typeof CANONICAL_RULESET_VERSION; readonly contentVersion: typeof CANONICAL_CONTENT_VERSION; readonly view: Record<string, unknown> }
  | { readonly kind: "REJECTED"; readonly reason: "MISSING_STATE_VERSION" | "UNSUPPORTED_STATE_VERSION" | "CANONICAL_CONTENT_VERSION_INVALID" | "LEGACY_BOARD_SHAPE_INVALID" | "LEGACY_BOARD_CELL_OUTSIDE_CANONICAL_BOUNDS" | "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isEventMigrationError(value: Record<string, unknown> | { readonly reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" }): value is { readonly reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" } {
  return "reason" in value;
}

function migrateEventPositions(view: Record<string, unknown>): Record<string, unknown> | { readonly reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" } {
  const combatRecord = view.combatRecord;
  if (!isRecord(combatRecord) || !Array.isArray(combatRecord.events)) return view;
  const events = combatRecord.events.map((event) => {
    if (!isRecord(event) || !isRecord(event.payload)) return event;
    const payload = { ...event.payload };
    for (const field of ["position", "from", "to"]) {
      if (!(field in payload)) continue;
      if (!Number.isSafeInteger(payload[field])) return { reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" as const };
      const migrated = migrateLegacyPosition4x8(payload[field] as number);
      if (migrated.kind === "REJECTED") return { reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" as const };
      payload[field] = migrated.position;
    }
    return { ...event, payload };
  });
  const rejected = events.find((event) => isRecord(event) && event.reason === "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS");
  if (rejected !== undefined) return rejected as { readonly reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" };
  return { ...view, combatRecord: { ...combatRecord, events } };
}

/** Reads a persisted envelope and makes the legacy conversion explicit and idempotent. */
export function readVersionedRunState(input: unknown): VersionedStateResult {
  if (!isRecord(input) || typeof input.schema_version !== "string" || !isRecord(input.view)) {
    return { kind: "REJECTED", reason: "MISSING_STATE_VERSION" };
  }
  const version = input.schema_version;
  const view = input.view;
  if (version === CANONICAL_RULESET_VERSION) {
    if (view.contentVersion !== CANONICAL_CONTENT_VERSION) return { kind: "REJECTED", reason: "CANONICAL_CONTENT_VERSION_INVALID" };
    if (!Array.isArray(view.board) || view.board.length !== 12) return { kind: "REJECTED", reason: "LEGACY_BOARD_SHAPE_INVALID" };
    return { kind: "CANONICAL", version, contentVersion: CANONICAL_CONTENT_VERSION, view };
  }
  if (version !== "alpha-0.3.0") return { kind: "REJECTED", reason: "UNSUPPORTED_STATE_VERSION" };
  const board = view.board;
  if (!Array.isArray(board)) return { kind: "REJECTED", reason: "LEGACY_BOARD_SHAPE_INVALID" };
  const migrated = migrateLegacyBoard4x8(board, version);
  if (migrated.kind === "REJECTED") return { kind: "REJECTED", reason: migrated.reason };
  const migratedView = migrateEventPositions({ ...view, board: migrated.board });
  if (isEventMigrationError(migratedView)) return { kind: "REJECTED", reason: migratedView.reason };
  return {
    kind: "MIGRATED",
    sourceVersion: version,
    targetVersion: CANONICAL_RULESET_VERSION,
    contentVersion: CANONICAL_CONTENT_VERSION,
    view: migratedView,
  };
}
