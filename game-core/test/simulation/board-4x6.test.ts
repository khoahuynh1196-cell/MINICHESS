import { describe, expect, it } from "vitest";
import {
  BOARD_CELL_COUNT,
  BOARD_COLUMNS,
  BOARD_ROWS,
  PLAYER_GLOBAL_START,
  PLAYER_FORMATION_SIZE,
  runHeadlessCombat,
} from "../../src/index.js";

const unit = (side: "player" | "enemy", position: number) => ({
  id: `${side}-${position}`,
  side,
  position,
  maxHp: 100,
  attackDamage: 10,
  attackSpeed: 100,
  armor: 0,
  magicResist: 0,
  attackRange: 1,
  startingMana: 0,
  maxMana: 100,
  critChance: 0,
  critMultiplier: 1_500,
});

describe("4x6 board contract", () => {
  it("exposes six rows and twelve cells per side", () => {
    expect(BOARD_COLUMNS).toBe(4);
    expect(BOARD_ROWS).toBe(6);
    expect(BOARD_CELL_COUNT).toBe(24);
    expect(PLAYER_GLOBAL_START).toBe(12);
    expect(PLAYER_FORMATION_SIZE).toBe(12);
  });

  it("accepts positions 0..23 and rejects the old 4x8 tail", () => {
    const snapshot = {
      combatId: "board-4x6",
      contentVersion: "alpha-0.3.0",
      rulesetVersion: "rules-1",
      combatSeed: "seed",
      maxTicks: 1,
      units: [unit("enemy", 0), unit("player", 23)],
    } as const;

    expect(() => runHeadlessCombat(snapshot)).not.toThrow();
    expect(() => runHeadlessCombat({ ...snapshot, units: [unit("enemy", 0), unit("player", 24)] })).toThrow("Invalid board position");
  });
});
