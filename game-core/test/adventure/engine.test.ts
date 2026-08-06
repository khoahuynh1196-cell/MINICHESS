import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
  resolveAdventureCombat,
  type AdventureCombatEngine,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function combatReady() {
  const initial = createAdventureGame({ id: "engine-run", seed: "engine-seed", content, rules });
  const bought = applyAdventureCommand(initial, {
    commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
  }, rules).state;
  const moved = applyAdventureCommand(bought, {
    commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
    heroInstanceId: "hero:engine-run:buy", destination: { kind: "board", index: 0 },
  }, rules).state;
  return applyAdventureCommand(moved, {
    commandId: "start", expectedRevision: 2, type: "START_ROUND",
  }, rules).state;
}

describe("Adventure combat engine port", () => {
  it("resolves through an injected synchronous engine", async () => {
    let calls = 0;
    const engine: AdventureCombatEngine = {
      resolve(request) {
        calls += 1;
        expect(request.state.run.phase).toBe("COMBAT");
        expect(request.rules).toBe(rules);
        expect(request.content).toBe(content);
        return {
          round: 1,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "engine-result",
          finalTick: 100,
          reason: "elimination",
        };
      },
    };
    const command = { commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" as const };
    const result = await resolveAdventureCombat(combatReady(), command, engine, rules, content);

    expect(calls).toBe(1);
    expect(result.state.run.phase).toBe("REWARD");
    expect(result.state.lastCombat?.resultHash).toBe("engine-result");
  });

  it("does not call the engine again for an idempotent retry", async () => {
    let calls = 0;
    const engine: AdventureCombatEngine = {
      async resolve() {
        calls += 1;
        return {
          round: 1,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "engine-result",
          finalTick: 100,
          reason: "elimination",
        };
      },
    };
    const command = { commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" as const };
    const first = await resolveAdventureCombat(combatReady(), command, engine, rules, content);
    const replay = await resolveAdventureCombat(first.state, command, engine, rules, content);

    expect(calls).toBe(1);
    expect(replay).toEqual({ state: first.state, revision: 4, replayed: true });
  });

  it("propagates engine failures without committing a receipt", async () => {
    const state = combatReady();
    const engine: AdventureCombatEngine = {
      resolve() {
        throw new Error("SIMULATION_FAILED");
      },
    };

    await expect(resolveAdventureCombat(state, {
      commandId: "resolve-failure", expectedRevision: 3, type: "RESOLVE_COMBAT",
    }, engine, rules, content)).rejects.toThrow("SIMULATION_FAILED");
    expect(state.run.revision).toBe(3);
    expect(state.commandHistory["resolve-failure"]).toBeUndefined();
  });
});
