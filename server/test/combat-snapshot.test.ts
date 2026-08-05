import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle, runHeadlessCombat, type CombatSnapshot } from "@auto-battler/game-core";

const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));

describe("combat snapshot adapter", () => {
  it("carries a content-defined summon through H15's production combat snapshot", async () => {
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      lockedSnapshot: {
        runId: "run-h15-summon", contentVersion: "alpha-0.3.0", round: 1,
        board: [{ instanceId: "h15", heroId: "H15", cost: 1 }, ...Array(11).fill(null)],
      },
      combatId: "combat-h15-summon", combatSeed: "seed-h15-summon", rulesetVersion: "alpha-0.3.0",
    });

    expect(snapshot.board).toEqual({
      columns: 3, rows: 8,
      enemyRows: { start: 0, end: 3 },
      playerRows: { start: 4, end: 7 },
      movement: "orthogonal",
    });

    let enemyIndex = 0;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 11,
      units: snapshot.units.map((unit) => {
        if (unit.id === "player:h15") {
          return { ...unit, position: 1, attackSpeed: 0, startingMana: 100_000, maxMana: 100_000 };
        }
        const position = enemyIndex === 0 ? 4 : 7;
        enemyIndex += 1;
        return { ...unit, position, attackSpeed: 0 };
      }),
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "UNIT_SUMMONED", sourceUnitId: "player:h15",
    }));
  });
});
