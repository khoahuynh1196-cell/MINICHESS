import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AdventureSession,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
  createAdventureCombatPlayback,
  type AdventureCombatEngine,
  type AdventureCombatEngineResult,
  type AdventureCombatSnapshot,
  type AdventureStateStore,
} from "../../src/index.js";

const releasePath = fileURLToPath(new URL("../../../releases/offline-foundation-0.1.0/release.json", import.meta.url));
const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const release = compileOfflineRelease(JSON.parse(readFileSync(releasePath, "utf8")));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

class MemoryStore implements AdventureStateStore {
  encoded: string | undefined;
  saves = 0;
  clears = 0;

  load(): string | undefined {
    return this.encoded;
  }

  save(encoded: string): void {
    this.encoded = encoded;
    this.saves += 1;
  }

  clear(): void {
    this.encoded = undefined;
    this.clears += 1;
  }
}

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

function dependencies(store: MemoryStore, engine?: AdventureCombatEngine) {
  return {
    release,
    rules,
    content,
    assetRevision: "original-chibi-cutouts-v3",
    clientSchema: 1,
    combatEngine: engine ?? {
      resolve(request) {
        return minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: `session-result-${request.snapshot.round}`,
          finalTick: 100,
          reason: "elimination",
        });
      },
    },
    store,
  };
}

async function reachCombat(session: AdventureSession): Promise<void> {
  const initial = session.state;
  const slot = initial.run.shop[0];
  if (slot === null || slot === undefined) throw new Error("Initial session shop is empty");
  await session.dispatch({
    commandId: "buy",
    expectedRevision: 0,
    type: "BUY_SHOP_HERO",
    shopSlotIndex: 0,
  });
  await session.dispatch({
    commandId: "move",
    expectedRevision: 1,
    type: "MOVE_HERO",
    heroInstanceId: `hero:${initial.run.id}:buy`,
    destination: { kind: "board", index: 0 },
  });
  await session.dispatch({ commandId: "start", expectedRevision: 2, type: "START_ROUND" });
}

describe("offline Adventure session", () => {
  it("starts, persists every accepted mutation, and completes one round", async () => {
    const store = new MemoryStore();
    const session = new AdventureSession(dependencies(store));
    await session.start({ id: "session-run", seed: "session-seed" });
    await reachCombat(session);
    const resolved = await session.resolveCombat({
      commandId: "resolve",
      expectedRevision: 3,
      type: "RESOLVE_COMBAT",
    });
    expect(resolved.state.run.phase).toBe("PLAYBACK");
    const acked = await session.ackPlaybackComplete({
      commandId: "ack",
      expectedRevision: 4,
      type: "ACK_PLAYBACK_COMPLETE",
    });
    expect(acked.state.run.phase).toBe("REWARD");
    const selections = acked.state.pendingReward!.offers.map((offer) => ({
      offerId: offer.id,
      optionId: offer.options[0]!.id,
    }));
    await session.claimReward({
      commandId: "claim",
      expectedRevision: 5,
      type: "CLAIM_ROUND_REWARD",
      selections,
    });

    expect(session.state.run).toMatchObject({ phase: "PREPARE", round: 2, revision: 6 });
    expect(store.encoded).toBeDefined();
    expect(store.saves).toBe(7);
  });

  it("restores the exact checksummed state in a new session", async () => {
    const store = new MemoryStore();
    const first = new AdventureSession(dependencies(store));
    await first.start({ id: "restore-run", seed: "restore-seed" });
    await first.dispatch({ commandId: "lock", expectedRevision: 0, type: "LOCK_SHOP" });

    const restoredSession = new AdventureSession(dependencies(store));
    const restored = await restoredSession.restore();

    expect(restored).toEqual(first.state);
    expect(restoredSession.state.run).toMatchObject({ revision: 1, shopLocked: true });
  });

  it("does not save or simulate twice for idempotent retries", async () => {
    const store = new MemoryStore();
    let engineCalls = 0;
    const engine: AdventureCombatEngine = {
      resolve(request) {
        engineCalls += 1;
        return minimalResult(request.snapshot, {
          round: request.snapshot.round,
          winner: "player",
          survivingEnemyUnits: 0,
          resultHash: "one-result",
          finalTick: 1,
          reason: "elimination",
        });
      },
    };
    const session = new AdventureSession(dependencies(store, engine));
    await session.start({ id: "retry-run", seed: "retry-seed" });
    await reachCombat(session);
    const savesBefore = store.saves;
    const command = { commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" as const };
    const first = await session.resolveCombat(command);
    const savesAfterFirst = store.saves;
    const replay = await session.resolveCombat(command);

    expect(engineCalls).toBe(1);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(store.saves).toBe(savesAfterFirst);
    expect(savesAfterFirst).toBe(savesBefore + 1);
  });

  it("resumes PLAYBACK after a restore without re-simulating combat", async () => {
    const store = new MemoryStore();
    let engineCalls = 0;
    const engine: AdventureCombatEngine = {
      resolve(request) {
        engineCalls += 1;
        return minimalResult(request.snapshot, {
          round: request.snapshot.round, winner: "player", survivingEnemyUnits: 0,
          resultHash: "resume-result", finalTick: 1, reason: "elimination",
        });
      },
    };
    const session = new AdventureSession(dependencies(store, engine));
    await session.start({ id: "resume-run", seed: "resume-seed" });
    await reachCombat(session);
    const resolved = await session.resolveCombat({ commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" });
    expect(resolved.state.run.phase).toBe("PLAYBACK");
    expect(engineCalls).toBe(1);

    const restoredSession = new AdventureSession(dependencies(store, engine));
    const restored = await restoredSession.restore();
    expect(restored?.run.phase).toBe("PLAYBACK");
    expect(restored?.lastCombat?.playback?.eventLogHash).toBe(resolved.playback.eventLogHash);

    const retried = await restoredSession.resolveCombat({ commandId: "resolve", expectedRevision: 3, type: "RESOLVE_COMBAT" });
    expect(engineCalls).toBe(1);
    expect(retried.replayed).toBe(true);
    expect(retried.playback.eventLogHash).toBe(resolved.playback.eventLogHash);

    const acked = await restoredSession.ackPlaybackComplete({ commandId: "ack", expectedRevision: 4, type: "ACK_PLAYBACK_COMPLETE" });
    expect(acked.state.run.phase).toBe("REWARD");
  });

  it("does not persist failed mutations", async () => {
    const store = new MemoryStore();
    const session = new AdventureSession(dependencies(store));
    await session.start({ id: "failed-run", seed: "failed-seed" });
    const savesBefore = store.saves;

    await expect(session.dispatch({ commandId: "start-empty", expectedRevision: 0, type: "START_ROUND" }))
      .rejects.toThrow("ADVENTURE_BOARD_EMPTY");
    expect(store.saves).toBe(savesBefore);
    expect(session.state.run.revision).toBe(0);
  });

  it("resets in-memory state and clears durable storage", async () => {
    const store = new MemoryStore();
    const session = new AdventureSession(dependencies(store));
    await session.start({ id: "reset-run", seed: "reset-seed" });
    await session.reset();

    expect(session.hasState).toBe(false);
    expect(store.encoded).toBeUndefined();
    expect(store.clears).toBe(1);
    expect(() => session.state).toThrow("ADVENTURE_SESSION_NOT_STARTED");
  });

  it("returns undefined when no saved run exists", async () => {
    const session = new AdventureSession(dependencies(new MemoryStore()));
    await expect(session.restore()).resolves.toBeUndefined();
    expect(session.hasState).toBe(false);
  });
});
