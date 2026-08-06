import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  boardCellCount,
  boardColumn,
  boardRow,
  compileRuleset,
  enemyBoardCellCount,
  globalBoardIndex,
  globalPlayerIndexToLocal,
  isEnemyPosition,
  isPlayerPosition,
  localPlayerIndexToGlobal,
  manhattanDistance,
  orthogonalNeighbors,
  playerBoardCellCount,
} from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

describe("rules-driven board geometry", () => {
  it("defines 32 global cells split into two 16-cell halves", () => {
    expect(boardCellCount(rules)).toBe(32);
    expect(enemyBoardCellCount(rules)).toBe(16);
    expect(playerBoardCellCount(rules)).toBe(16);
    expect(isEnemyPosition(rules, 0)).toBe(true);
    expect(isEnemyPosition(rules, 15)).toBe(true);
    expect(isEnemyPosition(rules, 16)).toBe(false);
    expect(isPlayerPosition(rules, 16)).toBe(true);
    expect(isPlayerPosition(rules, 31)).toBe(true);
  });

  it("maps player-local deployment cells to global positions 16 through 31", () => {
    expect(localPlayerIndexToGlobal(rules, 0)).toBe(16);
    expect(localPlayerIndexToGlobal(rules, 15)).toBe(31);
    expect(globalPlayerIndexToLocal(rules, 16)).toBe(0);
    expect(globalPlayerIndexToLocal(rules, 31)).toBe(15);
    expect(() => localPlayerIndexToGlobal(rules, 16)).toThrow("Invalid local player board index");
    expect(() => globalPlayerIndexToLocal(rules, 15)).toThrow("Position is not on the player board");
  });

  it("converts rows and columns using four columns", () => {
    expect(globalBoardIndex(rules, 4, 0)).toBe(16);
    expect(globalBoardIndex(rules, 7, 3)).toBe(31);
    expect(boardRow(rules, 22)).toBe(5);
    expect(boardColumn(rules, 22)).toBe(2);
  });

  it("returns stable orthogonal neighbors at corners and interior cells", () => {
    expect(orthogonalNeighbors(rules, 0)).toEqual([1, 4]);
    expect(orthogonalNeighbors(rules, 5)).toEqual([1, 4, 6, 9]);
    expect(orthogonalNeighbors(rules, 31)).toEqual([27, 30]);
  });

  it("computes Manhattan distance on the canonical board", () => {
    expect(manhattanDistance(rules, 0, 31)).toBe(10);
    expect(manhattanDistance(rules, 16, 19)).toBe(3);
    expect(manhattanDistance(rules, 18, 22)).toBe(1);
  });
});
