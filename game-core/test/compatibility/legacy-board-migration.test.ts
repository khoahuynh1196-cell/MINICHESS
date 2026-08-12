import { describe, expect, it } from "vitest";
import {
  migrateLegacyBoard4x8,
  migrateLegacyPosition4x8,
  readVersionedRunState,
} from "../../src/index.js";

describe("legacy 4x8 compatibility", () => {
  it("maps a 4x8 player board when the fourth row is empty", () => {
    const board = Array(16).fill(null) as (string | null)[];
    board[0] = "front-left";
    board[11] = "back-right";

    expect(migrateLegacyBoard4x8(board, "alpha-0.3.0")).toEqual({
      kind: "MIGRATED",
      sourceVersion: "alpha-0.3.0",
      targetVersion: "production-4x6-0.1.0",
      board: ["front-left", ...Array(10).fill(null), "back-right"],
      droppedCells: [],
    });
  });

  it("rejects an occupied fourth row instead of silently truncating it", () => {
    const board = Array(16).fill(null) as (string | null)[];
    board[12] = "cannot-fit";

    expect(migrateLegacyBoard4x8(board, "alpha-0.3.0")).toMatchObject({
      kind: "REJECTED",
      reason: "LEGACY_BOARD_CELL_OUTSIDE_CANONICAL_BOUNDS",
    });
  });

  it("maps global enemy and player cells only when their source row fits", () => {
    expect(migrateLegacyPosition4x8(0)).toEqual({ kind: "MIGRATED", position: 0 });
    expect(migrateLegacyPosition4x8(18)).toEqual({ kind: "MIGRATED", position: 14 });
    expect(migrateLegacyPosition4x8(15)).toMatchObject({ kind: "REJECTED" });
    expect(migrateLegacyPosition4x8(31)).toMatchObject({ kind: "REJECTED" });
  });

  it("rejects a replay/state envelope without an explicit schema version", () => {
    expect(readVersionedRunState({ view: { board: Array(16).fill(null) } })).toMatchObject({
      kind: "REJECTED",
      reason: "MISSING_STATE_VERSION",
    });
  });

  it("rejects a canonical envelope whose content version does not match the ruleset", () => {
    expect(readVersionedRunState({
      schema_version: "production-4x6-0.1.0",
      view: { contentVersion: "alpha-0.3.0", board: Array(12).fill(null) },
    })).toMatchObject({ kind: "REJECTED", reason: "CANONICAL_CONTENT_VERSION_INVALID" });
  });

  it("migrates legacy combat event positions and rejects an unmappable event", () => {
    expect(readVersionedRunState({
      schema_version: "alpha-0.3.0",
      view: {
        contentVersion: "alpha-0.3.0",
        board: Array(16).fill(null),
        combatRecord: { events: [{ type: "UNIT_MOVED", payload: { from: 18, to: 19 } }] },
      },
    })).toMatchObject({ kind: "MIGRATED", view: { combatRecord: { events: [{ payload: { from: 14, to: 15 } }] } } });
    expect(readVersionedRunState({
      schema_version: "alpha-0.3.0",
      view: {
        contentVersion: "alpha-0.3.0",
        board: Array(16).fill(null),
        combatRecord: { events: [{ type: "UNIT_MOVED", payload: { from: 18, to: 15 } }] },
      },
    })).toMatchObject({ kind: "REJECTED", reason: "LEGACY_EVENT_POSITION_OUTSIDE_CANONICAL_BOUNDS" });
  });
});
