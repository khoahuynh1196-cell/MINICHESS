import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRuleset, localPlayerIndexToGlobal } from "../../src/index.js";
import {
  LEGACY_ALPHA_GEOMETRY,
  PRODUCTION_4X8_GEOMETRY,
  cellAt,
  columnOf,
  displace,
  geometryFromRules,
  horizontalDirection,
  manhattanDistance,
  orthogonalNeighbors,
  rowOf,
  verticalDirection,
} from "../../src/simulation/geometry.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

describe("production 4x8 combat geometry", () => {
  it("derives geometry from the compiled production ruleset as 4x8", () => {
    expect(geometryFromRules(rules)).toEqual(PRODUCTION_4X8_GEOMETRY);
    expect(PRODUCTION_4X8_GEOMETRY).toEqual({ columns: 4, rows: 8, cellCount: 32 });
  });

  it("returns corner, interior, and last-cell neighbors without wrapping rows", () => {
    expect(orthogonalNeighbors(PRODUCTION_4X8_GEOMETRY, 0)).toEqual([1, 4]);
    expect(orthogonalNeighbors(PRODUCTION_4X8_GEOMETRY, 5)).toEqual([1, 4, 6, 9]);
    expect(orthogonalNeighbors(PRODUCTION_4X8_GEOMETRY, 31)).toEqual([27, 30]);
  });

  it("computes Manhattan distance across the full 4x8 board", () => {
    expect(manhattanDistance(PRODUCTION_4X8_GEOMETRY, 0, 31)).toBe(10);
  });

  it("maps player local cell 0 to global cell 16 through the compiled ruleset", () => {
    expect(localPlayerIndexToGlobal(rules, 0)).toBe(16);
    expect(rowOf(PRODUCTION_4X8_GEOMETRY, 16)).toBe(rules.board.playerRows.start);
  });

  it("disagrees with naive /3 or %3 pathing math on a 4-column board", () => {
    // Cell 7 is row 1, column 3 on a 4-column board (7 = 1*4 + 3) — the last
    // column of row 1. A three-column assumption would compute row 2,
    // column 1 (7 = 2*3 + 1) instead, which is a different cell entirely.
    expect(rowOf(PRODUCTION_4X8_GEOMETRY, 7)).toBe(1);
    expect(columnOf(PRODUCTION_4X8_GEOMETRY, 7)).toBe(3);
    expect(Math.floor(7 / 3)).toBe(2);
    expect(7 % 3).toBe(1);

    // Moving right from cell 7 must clamp at the row-1/column-3 wall, not
    // wrap into row 2 the way `(7 + 1) with columns=3` would (cell 8 under
    // 3-column math is a new row; under 4-column math it must stay row 1).
    expect(displace(PRODUCTION_4X8_GEOMETRY, 7, "right", 1)).toBe(7);
    expect(orthogonalNeighbors(PRODUCTION_4X8_GEOMETRY, 7)).toEqual([3, 6, 11]);
  });

  it("clamps knockback/dash/retreat displacement at every board edge instead of wrapping", () => {
    // Horizontal edges (row 0): left wall and right wall.
    expect(displace(PRODUCTION_4X8_GEOMETRY, 0, "left", 5)).toBe(0);
    expect(displace(PRODUCTION_4X8_GEOMETRY, 3, "right", 5)).toBe(3);
    // Vertical edges (column 0): top wall and bottom wall.
    expect(displace(PRODUCTION_4X8_GEOMETRY, 0, "up", 5)).toBe(0);
    expect(displace(PRODUCTION_4X8_GEOMETRY, 28, "down", 5)).toBe(28);
    // A knockback that fits fully on the board moves the exact distance.
    expect(displace(PRODUCTION_4X8_GEOMETRY, 1, "right", 2)).toBe(3);
    expect(displace(PRODUCTION_4X8_GEOMETRY, 20, "up", 2)).toBe(12);
    expect(cellAt(PRODUCTION_4X8_GEOMETRY, 5, 2)).toBe(22);
  });

  it("reports the direction a dash/retreat should move without changing position", () => {
    expect(horizontalDirection(PRODUCTION_4X8_GEOMETRY, 16, 19)).toBe(1);
    expect(horizontalDirection(PRODUCTION_4X8_GEOMETRY, 19, 16)).toBe(-1);
    expect(horizontalDirection(PRODUCTION_4X8_GEOMETRY, 16, 16)).toBe(0);
    expect(verticalDirection(PRODUCTION_4X8_GEOMETRY, 0, 28)).toBe(1);
    expect(verticalDirection(PRODUCTION_4X8_GEOMETRY, 28, 0)).toBe(-1);
  });

  it("keeps a legacy 3x8 geometry available only as a clearly named compatibility constant", () => {
    expect(LEGACY_ALPHA_GEOMETRY).toEqual({ columns: 3, rows: 8, cellCount: 24 });
    expect(LEGACY_ALPHA_GEOMETRY).not.toEqual(PRODUCTION_4X8_GEOMETRY);
  });

  it("rejects positions outside the geometry instead of silently wrapping", () => {
    expect(() => rowOf(PRODUCTION_4X8_GEOMETRY, 32)).toThrow("Combat position is outside the board geometry");
    expect(() => cellAt(PRODUCTION_4X8_GEOMETRY, 8, 0)).toThrow("row is outside the board geometry");
    expect(() => cellAt(PRODUCTION_4X8_GEOMETRY, 0, 4)).toThrow("column is outside the board geometry");
  });
});
