import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  AdventureSession,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
  createAdventureCombatPlayback,
  handleAdventureRuntimeRequest,
  parseAdventureRuntimeRequest,
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
  load() { return this.encoded; }
  save(encoded: string) { this.encoded = encoded; }
  clear() { this.encoded = undefined; }
}

function session() {
  return new AdventureSession({
    release,
    rules,
    content,
    assetRevision: release.assets.revision,
    clientSchema: 1,
    store: new MemoryStore(),
    combatEngine: {
      resolve({ snapshot }) {
        const outcome = {
          round: snapshot.round,
          winner: "player" as const,
          survivingEnemyUnits: 0,
          resultHash: "protocol-result",
          finalTick: 1,
          reason: "elimination" as const,
        };
        const playback = createAdventureCombatPlayback(snapshot, [
          { sequence: 0, tick: 0, type: "COMBAT_STARTED" as const, payload: {} },
          { sequence: 1, tick: outcome.finalTick, type: "COMBAT_ENDED" as const, payload: { winner: outcome.winner } },
        ]);
        return { outcome, playback };
      },
    },
  });
}

describe("strict Adventure runtime protocol", () => {
  it("parses each command family into the internal typed shape", () => {
    expect(parseAdventureRuntimeRequest({
      commandId: "move",
      expectedRevision: 2,
      type: "MOVE_HERO",
      heroInstanceId: "hero-a",
      destination: { kind: "board", index: 15 },
    })).toEqual({
      commandId: "move",
      expectedRevision: 2,
      type: "MOVE_HERO",
      heroInstanceId: "hero-a",
      destination: { kind: "board", index: 15 },
    });

    expect(parseAdventureRuntimeRequest({
      commandId: "claim",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections: [{ offerId: "offer", optionId: "option" }],
    })).toEqual({
      commandId: "claim",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections: [{ offerId: "offer", optionId: "option" }],
    });
  });

  it("rejects unknown commands, extra fields, invalid destinations, and malformed selections", () => {
    expect(() => parseAdventureRuntimeRequest({
      commandId: "x", expectedRevision: 0, type: "UNKNOWN",
    })).toThrow("Unsupported Adventure runtime request type: UNKNOWN");

    expect(() => parseAdventureRuntimeRequest({
      commandId: "x", expectedRevision: 0, type: "LOCK_SHOP", injectedGold: 999,
    })).toThrow("fields must be exactly");

    expect(() => parseAdventureRuntimeRequest({
      commandId: "x", expectedRevision: 0, type: "MOVE_HERO",
      heroInstanceId: "hero", destination: { kind: "enemy", index: 0 },
    })).toThrow("destination.kind must be board or bench");

    expect(() => parseAdventureRuntimeRequest({
      commandId: "x", expectedRevision: 0, type: "CLAIM_ROUND_REWARD", selections: {},
    })).toThrow("selections must be an array");
  });

  it("routes requests through the session and returns only a public view", async () => {
    const runtime = session();
    await runtime.start({ id: "protocol-run", seed: "private-protocol-seed" });
    const response = await handleAdventureRuntimeRequest(runtime, {
      commandId: "lock",
      expectedRevision: 0,
      type: "LOCK_SHOP",
    });
    const serialized = JSON.stringify(response);

    expect(response).toMatchObject({
      revision: 1,
      replayed: false,
      view: { id: "protocol-run", revision: 1, shopLocked: true },
    });
    expect(serialized).not.toContain("private-protocol-seed");
    expect(serialized).not.toContain("shopPool");
    expect(serialized).not.toContain("commandHistory");
  });

  it("preserves idempotent replay semantics through the runtime boundary", async () => {
    const runtime = session();
    await runtime.start({ id: "protocol-replay", seed: "protocol-replay-seed" });
    const request = { commandId: "lock", expectedRevision: 0, type: "LOCK_SHOP" };
    const first = await handleAdventureRuntimeRequest(runtime, request);
    const replay = await handleAdventureRuntimeRequest(runtime, request);

    expect(first.replayed).toBe(false);
    expect(replay).toMatchObject({ revision: 1, replayed: true });
    expect(replay.view).toEqual(first.view);
  });
});
