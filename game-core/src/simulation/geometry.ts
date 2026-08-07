/**
 * Explicit combat-board geometry for the simulation layer.
 *
 * `rules/board.ts` is the authoritative rules-level geometry API and always
 * takes a full `CompiledRuleset`. This module exists so the combat
 * simulation layer can depend on a minimal, explicit `CombatGeometry` value
 * instead of implicitly hardcoding board shape (as the legacy kernel's
 * `BOARD_CELL_COUNT = 24` / `/ 3` / `% 3` math does). Every helper here takes
 * geometry as an explicit parameter — there is no default board shape.
 */

export interface CombatGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly cellCount: number;
}

export type CombatDirection = "up" | "down" | "left" | "right";

function makeGeometry(columns: number, rows: number): CombatGeometry {
  if (!Number.isSafeInteger(columns) || columns < 1) throw new Error("columns must be a positive safe integer");
  if (!Number.isSafeInteger(rows) || rows < 1) throw new Error("rows must be a positive safe integer");
  return Object.freeze({ columns, rows, cellCount: columns * rows });
}

/** The locked production combat board: 4 columns x 8 rows. */
export const PRODUCTION_4X8_GEOMETRY: CombatGeometry = makeGeometry(4, 8);

/** The historical Alpha combat board, retained only for legacy replay adapters. */
export const LEGACY_ALPHA_GEOMETRY: CombatGeometry = makeGeometry(3, 8);

/**
 * Derives geometry from any rules/snapshot shape carrying `board.columns` and
 * `board.rows` (both `CompiledRuleset` and `AdventureCombatSnapshot` satisfy
 * this structurally). Production combat must always call this rather than
 * assuming `PRODUCTION_4X8_GEOMETRY`, so a future ruleset change cannot
 * silently desync the simulation from the authored board shape.
 */
export function geometryFromRules(source: { readonly board: { readonly columns: number; readonly rows: number } }): CombatGeometry {
  return makeGeometry(source.board.columns, source.board.rows);
}

export function isLegalCell(geometry: CombatGeometry, position: number): boolean {
  return Number.isSafeInteger(position) && position >= 0 && position < geometry.cellCount;
}

export function assertLegalCell(geometry: CombatGeometry, position: number): void {
  if (!isLegalCell(geometry, position)) throw new Error("Combat position is outside the board geometry");
}

export function rowOf(geometry: CombatGeometry, position: number): number {
  assertLegalCell(geometry, position);
  return Math.floor(position / geometry.columns);
}

export function columnOf(geometry: CombatGeometry, position: number): number {
  assertLegalCell(geometry, position);
  return position % geometry.columns;
}

export function cellAt(geometry: CombatGeometry, row: number, column: number): number {
  if (!Number.isSafeInteger(row) || row < 0 || row >= geometry.rows) throw new Error("row is outside the board geometry");
  if (!Number.isSafeInteger(column) || column < 0 || column >= geometry.columns) throw new Error("column is outside the board geometry");
  return row * geometry.columns + column;
}

export function manhattanDistance(geometry: CombatGeometry, left: number, right: number): number {
  assertLegalCell(geometry, left);
  assertLegalCell(geometry, right);
  return Math.abs(rowOf(geometry, left) - rowOf(geometry, right))
    + Math.abs(columnOf(geometry, left) - columnOf(geometry, right));
}

/** Legal orthogonal neighbors in ascending global-index order. Never crosses a row/column boundary. */
export function orthogonalNeighbors(geometry: CombatGeometry, position: number): readonly number[] {
  const row = rowOf(geometry, position);
  const column = columnOf(geometry, position);
  const neighbors: number[] = [];
  if (column > 0) neighbors.push(position - 1);
  if (column + 1 < geometry.columns) neighbors.push(position + 1);
  if (row > 0) neighbors.push(position - geometry.columns);
  if (row + 1 < geometry.rows) neighbors.push(position + geometry.columns);
  return Object.freeze(neighbors.sort((a, b) => a - b));
}

/** Sign of the column delta needed to move from `from` towards `to` (0 if already aligned). */
export function horizontalDirection(geometry: CombatGeometry, from: number, to: number): -1 | 0 | 1 {
  const delta = columnOf(geometry, to) - columnOf(geometry, from);
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

/** Sign of the row delta needed to move from `from` towards `to` (0 if already aligned). */
export function verticalDirection(geometry: CombatGeometry, from: number, to: number): -1 | 0 | 1 {
  const delta = rowOf(geometry, to) - rowOf(geometry, from);
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

/**
 * Moves `distance` cells from `position` in a straight `direction`, clamped
 * to the board edge. Used for dash/retreat/knockback: displacement always
 * stays within the starting row (for "left"/"right") or starting column
 * (for "up"/"down") — it can never wrap into an adjacent row or column, which
 * is exactly the class of bug `/ columns` and `% columns` arithmetic against
 * the wrong column count produces.
 */
export function displace(geometry: CombatGeometry, position: number, direction: CombatDirection, distance: number): number {
  assertLegalCell(geometry, position);
  if (!Number.isSafeInteger(distance) || distance < 0) throw new Error("distance must be a non-negative safe integer");
  const row = rowOf(geometry, position);
  const column = columnOf(geometry, position);
  switch (direction) {
    case "left":
      return cellAt(geometry, row, Math.max(0, column - distance));
    case "right":
      return cellAt(geometry, row, Math.min(geometry.columns - 1, column + distance));
    case "up":
      return cellAt(geometry, Math.max(0, row - distance), column);
    case "down":
      return cellAt(geometry, Math.min(geometry.rows - 1, row + distance), column);
  }
}
