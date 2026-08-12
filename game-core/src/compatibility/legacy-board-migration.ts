import { CANONICAL_RULESET_VERSION } from "../rules/board-contract.js";

const PLAYER_FORMATION_SIZE = 12;

export type LegacyCell = unknown;

export type PositionMigrationResult =
  | { readonly kind: "MIGRATED"; readonly position: number }
  | { readonly kind: "REJECTED"; readonly reason: "LEGACY_POSITION_OUTSIDE_CANONICAL_BOUNDS" };

export type BoardMigrationResult<T = LegacyCell> =
  | {
      readonly kind: "MIGRATED";
      readonly sourceVersion: string;
      readonly targetVersion: typeof CANONICAL_RULESET_VERSION;
      readonly board: readonly (T | null)[];
      readonly droppedCells: readonly number[];
    }
  | {
      readonly kind: "REJECTED";
      readonly sourceVersion: string;
      readonly targetVersion: typeof CANONICAL_RULESET_VERSION;
      readonly reason: "LEGACY_BOARD_SHAPE_INVALID" | "LEGACY_BOARD_CELL_OUTSIDE_CANONICAL_BOUNDS";
      readonly cell?: number;
    };

/** Maps only rows that exist in the canonical 4x6 board. */
export function migrateLegacyPosition4x8(position: number): PositionMigrationResult {
  if (!Number.isSafeInteger(position) || position < 0 || position > 31) {
    return { kind: "REJECTED", reason: "LEGACY_POSITION_OUTSIDE_CANONICAL_BOUNDS" };
  }
  if (position < 12) return { kind: "MIGRATED", position };
  if (position < 16) return { kind: "REJECTED", reason: "LEGACY_POSITION_OUTSIDE_CANONICAL_BOUNDS" };
  if (position < 28) return { kind: "MIGRATED", position: 12 + (position - 16) };
  return { kind: "REJECTED", reason: "LEGACY_POSITION_OUTSIDE_CANONICAL_BOUNDS" };
}

/** Migrates a legacy local 16-cell player formation without truncating occupied cells. */
export function migrateLegacyBoard4x8<T>(board: readonly (T | null)[], sourceVersion: string): BoardMigrationResult<T> {
  if (!Array.isArray(board) || board.length !== 16) {
    return { kind: "REJECTED", sourceVersion, targetVersion: CANONICAL_RULESET_VERSION, reason: "LEGACY_BOARD_SHAPE_INVALID" };
  }
  for (let index = PLAYER_FORMATION_SIZE; index < board.length; index += 1) {
    if (board[index] !== null && board[index] !== undefined) {
      return {
        kind: "REJECTED",
        sourceVersion,
        targetVersion: CANONICAL_RULESET_VERSION,
        reason: "LEGACY_BOARD_CELL_OUTSIDE_CANONICAL_BOUNDS",
        cell: index,
      };
    }
  }
  return {
    kind: "MIGRATED",
    sourceVersion,
    targetVersion: CANONICAL_RULESET_VERSION,
    board: Object.freeze(board.slice(0, PLAYER_FORMATION_SIZE).map((cell) => cell ?? null)),
    droppedCells: Object.freeze([]),
  };
}
