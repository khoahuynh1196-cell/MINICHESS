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
        board: [{ instanceId: "h15", heroId: "H15", cost: 1 }, ...Array(15).fill(null)],
      },
      combatId: "combat-h15-summon", combatSeed: "seed-h15-summon", rulesetVersion: "alpha-0.3.0",
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

  it("maps the first and last formation slots into the global player half", async () => {
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      lockedSnapshot: {
        runId: "run-player-half-snapshot", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "first-slot", heroId: "H01", cost: 1 },
          ...Array(14).fill(null),
          { instanceId: "last-slot", heroId: "H02", cost: 2 },
        ],
      },
      combatId: "combat-player-half-snapshot", combatSeed: "seed-player-half", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.filter((unit) => unit.side === "player").map((unit) => ({ id: unit.id, position: unit.position }))).toEqual([
      { id: "player:first-slot", position: 16 },
      { id: "player:last-slot", position: 31 },
    ]);
  });

  it("rejects a locked formation that would place a player outside the global board", async () => {
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    expect(() => adapter.buildCombatSnapshot({
      content,
      lockedSnapshot: {
        runId: "run-oversized-formation", contentVersion: "alpha-0.3.0", round: 1,
        board: [...Array(16).fill(null), { instanceId: "outside-board", heroId: "H01", cost: 1 }],
      },
      combatId: "combat-oversized-formation", combatSeed: "seed-oversized", rulesetVersion: "alpha-rules-0.3.0",
    })).toThrow("GAME_RULE_VIOLATION");
  });
});
