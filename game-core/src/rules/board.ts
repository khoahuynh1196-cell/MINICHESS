import type { BoardGeometry } from "./types.js";

export type BoardSide = "player" | "enemy";

export interface TargetingUnit {
  readonly id: string;
  readonly side: BoardSide;
  readonly position: number;
  readonly currentHp: number;
  readonly attackRange: number;
}

function compareStrings(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertPositiveInteger(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} must be a positive safe integer`);
}

function assertRowRange(board: BoardGeometry, range: unknown, label: string): asserts range is BoardGeometry["enemyRows"] {
  if (typeof range !== "object" || range === null) throw new Error(`${label} is required`);
  const rowRange = range as { readonly start?: unknown; readonly end?: unknown };
  if (!Number.isSafeInteger(rowRange.start) || !Number.isSafeInteger(rowRange.end)
    || (rowRange.start as number) < 0 || (rowRange.end as number) < (rowRange.start as number) || (rowRange.end as number) >= board.rows) {
    throw new Error(`${label} is outside board rows`);
  }
}

export function assertBoardGeometry(board: BoardGeometry): void {
  if (typeof board !== "object" || board === null) throw new Error("Board geometry is required");
  assertPositiveInteger(board.columns, "board.columns");
  assertPositiveInteger(board.rows, "board.rows");
  if (board.movement !== "orthogonal") throw new Error("board.movement must be orthogonal");
  assertRowRange(board, board.enemyRows, "board.enemyRows");
  assertRowRange(board, board.playerRows, "board.playerRows");
  if (board.enemyRows.start <= board.playerRows.end && board.playerRows.start <= board.enemyRows.end) {
    throw new Error("board side rows must not overlap");
  }
}

export function boardCellCount(board: BoardGeometry): number {
  assertBoardGeometry(board);
  return board.columns * board.rows;
}

export function playerBoardCellCount(board: BoardGeometry): number {
  assertBoardGeometry(board);
  return board.columns * (board.playerRows.end - board.playerRows.start + 1);
}

export function playerStartCell(board: BoardGeometry): number {
  assertBoardGeometry(board);
  return board.playerRows.start * board.columns;
}

export function assertBoardPosition(board: BoardGeometry, position: number): void {
  if (!Number.isSafeInteger(position) || position < 0 || position >= boardCellCount(board)) {
    throw new Error(`Invalid board position: ${position}`);
  }
}

export function manhattanDistance(board: BoardGeometry, left: number, right: number): number {
  assertBoardPosition(board, left);
  assertBoardPosition(board, right);
  const leftRow = Math.floor(left / board.columns);
  const leftColumn = left % board.columns;
  const rightRow = Math.floor(right / board.columns);
  const rightColumn = right % board.columns;
  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn);
}

export function sortedNeighbors(board: BoardGeometry, position: number): readonly number[] {
  assertBoardPosition(board, position);
  const row = Math.floor(position / board.columns);
  const column = position % board.columns;
  const neighbors: number[] = [];
  if (column > 0) neighbors.push(position - 1);
  if (column + 1 < board.columns) neighbors.push(position + 1);
  if (row > 0) neighbors.push(position - board.columns);
  if (row + 1 < board.rows) neighbors.push(position + board.columns);
  return Object.freeze(neighbors.sort((left, right) => left - right));
}

/** Returns positions to enter, excluding `start` and never entering `target`. */
export function findPathToRange(
  board: BoardGeometry,
  start: number,
  target: number,
  attackRange: number,
  occupiedPositions: readonly number[],
): readonly number[] | undefined {
  assertBoardPosition(board, start);
  assertBoardPosition(board, target);
  if (!Number.isSafeInteger(attackRange) || attackRange < 0) throw new Error("attackRange must be a non-negative safe integer");
  for (const position of occupiedPositions) assertBoardPosition(board, position);
  if (manhattanDistance(board, start, target) <= attackRange) return Object.freeze([]);

  const blocked = new Set(occupiedPositions);
  blocked.delete(start);
  const queue: number[] = [start];
  const predecessor = new Map<number, number>();
  const visited = new Set<number>([start]);

  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    for (const next of sortedNeighbors(board, current)) {
      if (visited.has(next) || blocked.has(next)) continue;
      visited.add(next);
      predecessor.set(next, current);
      if (manhattanDistance(board, next, target) <= attackRange) {
        const path: number[] = [next];
        let step = next;
        while (predecessor.get(step) !== start) {
          const previous = predecessor.get(step);
          if (previous === undefined) throw new Error("Path reconstruction failed");
          path.push(previous);
          step = previous;
        }
        return Object.freeze(path.reverse());
      }
      queue.push(next);
    }
  }
  return undefined;
}

export function selectNearestTarget<T extends TargetingUnit>(
  board: BoardGeometry,
  actor: TargetingUnit,
  candidates: readonly T[],
  occupiedPositions: readonly number[],
): T | undefined {
  const options = candidates
    .filter((candidate) => candidate.side !== actor.side && candidate.currentHp > 0)
    .map((candidate) => ({
      candidate,
      path: findPathToRange(board, actor.position, candidate.position, actor.attackRange, occupiedPositions),
    }))
    .filter((option): option is { candidate: T; path: readonly number[] } => option.path !== undefined);

  options.sort((left, right) => left.path.length - right.path.length
    || left.candidate.currentHp - right.candidate.currentHp
    || left.candidate.position - right.candidate.position
    || compareStrings(left.candidate.id, right.candidate.id));
  return options[0]?.candidate;
}
