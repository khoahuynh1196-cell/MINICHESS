import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  compileContentBundle,
  compileRuleset,
  createAdventureCombatPlayback,
  createAdventureGame,
  resolveAdventureCombat,
  type AdventureCombatEngine,
  type AdventureCombatEngineResult,
  type AdventureCombatSnapshot,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function minimalResult(
  snapshot: AdventureCombatSnapshot,
  outcome: { round: number; winner: "player" | "enemy"; survivingEnemyUnits: number; resultHash: string; finalTick: number; reason: "elimination" | "timeout" },
): AdventureCombatEngineResult {
  const playback = createAdventureCombatPlayback(snapshot, [
    { sequence: 0, tick: 0, type: "COMBAT_STARTED", payload: {} },
    { sequence: 1, tick: outcome.finalTick, type: "COMBAT_ENDED", payload: { winner: outcome.winner } },
  ]);
  return { outcome, playback };
}

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
  it("resolves through an injected synchronous engine using a locked 4x8 snapshot", async () => {
    let calls = 0;
    const engine: AdventureCombatEngine = {
      resolve(request) {
        calls += 1;
        expect(request.snapshot).toMatchObject({
          runId: "engine-run",
          round: 1,
          rulesetVersion: rules.version,
          contentVersion: content.version,
          board: {
            columns: 4,
            rows: 8,
            enemyRows: { start: 0, end: 3 },
            playerRows: { start: 4, end: 7 },
          },
        });
        expect(Object.isFrozen(request.snapshot)).toBe(true);
        expect(request.rules).toBe(rules);
        expect(request.content).toBe(content);
        return minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "engine-result",
          finalTick: 100,
          reason: "elimination",
        });
      },
    };
    const command = { commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" as const };
    const result = await resolveAdventureCombat(combatReady(), command, engine, rules, content);

    expect(calls).toBe(1);
    expect(result.state.run.phase).toBe("PLAYBACK");
    expect(result.state.lastCombat?.resultHash).toBe("engine-result");
    expect(result.playback.combatId).toBe(result.state.lastCombat?.playback?.combatId);
  });

  it("does not build a snapshot or call the engine again for an idempotent retry", async () => {
    let calls = 0;
    const engine: AdventureCombatEngine = {
      async resolve(request) {
        calls += 1;
        return minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "engine-result",
          finalTick: 100,
          reason: "elimination",
        });
      },
    };
    const command = { commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" as const };
    const first = await resolveAdventureCombat(combatReady(), command, engine, rules, content);
    const replay = await resolveAdventureCombat(first.state, command, engine, rules, content);

    expect(calls).toBe(1);
    expect(replay).toEqual({ state: first.state, revision: 4, replayed: true, playback: first.playback });
  });

  it("rejects a playback with a tampered event-log hash before committing", async () => {
    const engine: AdventureCombatEngine = {
      resolve(request) {
        const result = minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "tampered-result",
          finalTick: 100,
          reason: "elimination",
        });
        return { ...result, playback: { ...result.playback, eventLogHash: "f".repeat(64) } };
      },
    };
    const state = combatReady();

    await expect(resolveAdventureCombat(state, {
      commandId: "resolve-tampered", expectedRevision: 3, type: "RESOLVE_COMBAT",
    }, engine, rules, content)).rejects.toThrow("ADVENTURE_PLAYBACK_HASH_MISMATCH");
    expect(state.commandHistory["resolve-tampered"]).toBeUndefined();
  });

  it("rejects a playback whose final event disagrees with the authoritative winner", async () => {
    const engine: AdventureCombatEngine = {
      resolve(request) {
        const result = minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "enemy",
          survivingEnemyUnits: 1,
          resultHash: "winner-mismatch",
          finalTick: 100,
          reason: "elimination",
        });
        return { outcome: { ...result.outcome, winner: "player" }, playback: result.playback };
      },
    };

    await expect(resolveAdventureCombat(combatReady(), {
      commandId: "resolve-winner-mismatch", expectedRevision: 3, type: "RESOLVE_COMBAT",
    }, engine, rules, content)).rejects.toThrow("ADVENTURE_PLAYBACK_WINNER_MISMATCH");
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

  it("rejects an engine outcome for another round", async () => {
    const engine: AdventureCombatEngine = {
      resolve(request) {
        return minimalResult(request.snapshot, {
          round: 2,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "wrong-round",
          finalTick: 1,
          reason: "elimination",
        });
      },
    };

    await expect(resolveAdventureCombat(combatReady(), {
      commandId: "wrong-round", expectedRevision: 3, type: "RESOLVE_COMBAT",
    }, engine, rules, content)).rejects.toThrow("ADVENTURE_ENGINE_ROUND_MISMATCH");
  });
});
