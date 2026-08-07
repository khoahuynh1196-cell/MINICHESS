import type { BoardRules, CompiledRuleset } from "./types.js";

type RulesWithBoard = Pick<CompiledRuleset, "board"> | { readonly board: BoardRules };

function assertInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
}

export function boardCellCount(rules: RulesWithBoard): number {
  return rules.board.columns * rules.board.rows;
}

export function playerBoardCellCount(rules: RulesWithBoard): number {
  return (rules.board.playerRows.end - rules.board.playerRows.start + 1) * rules.board.columns;
}

export function enemyBoardCellCount(rules: RulesWithBoard): number {
  return (rules.board.enemyRows.end - rules.board.enemyRows.start + 1) * rules.board.columns;
}

export function globalBoardIndex(rules: RulesWithBoard, row: number, column: number): number {
  assertInteger(row, "row");
  assertInteger(column, "column");
  if (row < 0 || row >= rules.board.rows || column < 0 || column >= rules.board.columns) {
    throw new Error("Board coordinate is outside the ruleset");
  }
  return row * rules.board.columns + column;
}

export function boardRow(rules: RulesWithBoard, position: number): number {
  assertGlobalPosition(rules, position);
  return Math.floor(position / rules.board.columns);
}

export function boardColumn(rules: RulesWithBoard, position: number): number {
  assertGlobalPosition(rules, position);
  return position % rules.board.columns;
}

export function isValidGlobalPosition(rules: RulesWithBoard, position: number): boolean {
  return Number.isSafeInteger(position) && position >= 0 && position < boardCellCount(rules);
}

export function assertGlobalPosition(rules: RulesWithBoard, position: number): void {
  if (!isValidGlobalPosition(rules, position)) throw new Error("Invalid global board position");
}

export function isEnemyPosition(rules: RulesWithBoard, position: number): boolean {
  if (!isValidGlobalPosition(rules, position)) return false;
  const row = Math.floor(position / rules.board.columns);
  return row >= rules.board.enemyRows.start && row <= rules.board.enemyRows.end;
}

export function isPlayerPosition(rules: RulesWithBoard, position: number): boolean {
  if (!isValidGlobalPosition(rules, position)) return false;
  const row = Math.floor(position / rules.board.columns);
  return row >= rules.board.playerRows.start && row <= rules.board.playerRows.end;
}

export function localPlayerIndexToGlobal(rules: RulesWithBoard, localIndex: number): number {
  assertInteger(localIndex, "localIndex");
  const cellCount = playerBoardCellCount(rules);
  if (localIndex < 0 || localIndex >= cellCount) throw new Error("Invalid local player board index");
  return rules.board.playerRows.start * rules.board.columns + localIndex;
}

export function globalPlayerIndexToLocal(rules: RulesWithBoard, globalPosition: number): number {
  if (!isPlayerPosition(rules, globalPosition)) throw new Error("Position is not on the player board");
  return globalPosition - rules.board.playerRows.start * rules.board.columns;
}

export function manhattanDistance(rules: RulesWithBoard, left: number, right: number): number {
  assertGlobalPosition(rules, left);
  assertGlobalPosition(rules, right);
  return Math.abs(boardRow(rules, left) - boardRow(rules, right))
    + Math.abs(boardColumn(rules, left) - boardColumn(rules, right));
}

/** Returns legal orthogonal neighbors in ascending global-index order. */
export function orthogonalNeighbors(rules: RulesWithBoard, position: number): readonly number[] {
  assertGlobalPosition(rules, position);
  const row = boardRow(rules, position);
  const column = boardColumn(rules, position);
  const neighbors: number[] = [];
  if (column > 0) neighbors.push(position - 1);
  if (column + 1 < rules.board.columns) neighbors.push(position + 1);
  if (row > 0) neighbors.push(position - rules.board.columns);
  if (row + 1 < rules.board.rows) neighbors.push(position + rules.board.columns);
  return Object.freeze(neighbors.sort((left, right) => left - right));
}
