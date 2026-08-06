import { describe, expect, it } from "vitest";

import {
  assertBoardPosition,
  boardCellCount,
  findPathToRange,
  manhattanDistance,
  playerBoardCellCount,
  playerStartCell,
  selectNearestTarget,
  sortedNeighbors,
  type BoardGeometry,
} from "../../src/index.js";

const board: BoardGeometry = {
  columns: 4,
  rows: 8,
  enemyRows: { start: 0, end: 3 },
  playerRows: { start: 4, end: 7 },
  movement: "orthogonal",
};

describe("rules-driven board geometry", () => {
  it("rejects malformed geometry with a controlled validation error", () => {
    expect(() => boardCellCount({ ...board, enemyRows: undefined } as unknown as BoardGeometry))
      .toThrow("board.enemyRows is required");
  });

  it("derives production board bounds and player territory", () => {
    expect(boardCellCount(board)).toBe(32);
    expect(playerBoardCellCount(board)).toBe(16);
    expect(playerStartCell(board)).toBe(16);
    expect(() => assertBoardPosition(board, 31)).not.toThrow();
    expect(() => assertBoardPosition(board, 32)).toThrow("Invalid board position: 32");
  });

  it("measures and enumerates neighbors without wrapping rows", () => {
    expect(manhattanDistance(board, 0, 31)).toBe(10);
    expect(sortedNeighbors(board, 0)).toEqual([1, 4]);
    expect(sortedNeighbors(board, 3)).toEqual([2, 7]);
    expect(sortedNeighbors(board, 17)).toEqual([13, 16, 18, 21]);
  });

  it("paths across the four-column board without entering the target", () => {
    expect(findPathToRange(board, 16, 3, 1, [16, 3])).toEqual([12, 8, 4, 0, 1, 2]);
  });

  it("selects a target using board-aware path length and stable tie breakers", () => {
    const target = selectNearestTarget(
      board,
      { id: "player:H01:1", side: "player", position: 17, currentHp: 100, attackRange: 1 },
      [
        { id: "enemy:E02:1", side: "enemy", position: 10, currentHp: 100, attackRange: 1 },
        { id: "enemy:E01:1", side: "enemy", position: 9, currentHp: 100, attackRange: 1 },
      ],
      [9, 10, 17],
    );

    expect(target?.id).toBe("enemy:E01:1");
  });
});
