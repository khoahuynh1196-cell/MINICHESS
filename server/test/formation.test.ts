import { describe, expect, it } from "vitest";
import { applyRunCommand, createInMemoryRunRepository } from "../src/application/run-commands.js";

const heroA = { instanceId: "hero-a", heroId: "H01", cost: 1 };
const heroB = { instanceId: "hero-b", heroId: "H02", cost: 2 };
const heroC = { instanceId: "hero-c", heroId: "H03", cost: 1 };

describe("formation commands", () => {
  it("moves board heroes to the addressed bench slot and preserves authoritative ordering", async () => {
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-return-bench", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8,
      commandResponses: {}, bench: [heroC], board: [heroA, heroB, ...Array(10).fill(null)],
    });

    await applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-return-bench", commandId: "move-back", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroA.instanceId, destination: 0 }, repository);

    await expect(repository.get("run-return-bench", "tenant-a")).resolves.toMatchObject({
      revision: 1,
      bench: [heroA, heroC],
      board: [null, heroB, ...Array(10).fill(null)],
    });
  });

  it("supports bench-to-board placement and board-to-board swaps without local resolution", async () => {
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-formation-swap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8,
      commandResponses: {}, bench: [heroC], board: [heroA, heroB, ...Array(10).fill(null)],
    });

    await applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-formation-swap", commandId: "bench-to-board", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroC.instanceId, destination: 14 }, repository);
    await applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-formation-swap", commandId: "board-swap", expectedRevision: 1, type: "MOVE_HERO", heroInstanceId: heroA.instanceId, destination: 13 }, repository);

    await expect(repository.get("run-formation-swap", "tenant-a")).resolves.toMatchObject({
      revision: 2,
      bench: [],
      board: [heroB, heroA, heroC, ...Array(9).fill(null)],
    });
  });

  it("rejects a return-to-bench when the authoritative bench is full or the run is in combat", async () => {
    const repository = createInMemoryRunRepository();
    const fullBench = Array.from({ length: 8 }, (_, index) => ({ instanceId: `bench-${index}`, heroId: "H04", cost: 1 }));
    await repository.save({
      id: "run-full-bench", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8,
      commandResponses: {}, bench: fullBench, board: [heroA, ...Array(11).fill(null)],
    });
    await expect(applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-full-bench", commandId: "full-bench", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroA.instanceId, destination: 0 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await repository.save({
      id: "run-combat-formation", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "COMBAT", revision: 0, gold: 8,
      commandResponses: {}, bench: [heroA], board: Array(12).fill(null),
    });
    await expect(applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-combat-formation", commandId: "combat-move", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroA.instanceId, destination: 16 }, repository)).rejects.toThrow("COMMAND_NOT_ALLOWED");
  });

  it("maps the player half endpoints to the first and last authoritative formation slots", async () => {
    const repository = createInMemoryRunRepository();
    const heroD = { instanceId: "hero-d", heroId: "H04", cost: 1 };
    await repository.save({
      id: "run-player-half", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8,
      commandResponses: {}, bench: [heroC, heroD], board: Array(12).fill(null),
    });

    await applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-player-half", commandId: "move-first-player-cell", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroC.instanceId, destination: 12 }, repository);
    await applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-player-half", commandId: "move-last-player-cell", expectedRevision: 1, type: "MOVE_HERO", heroInstanceId: heroD.instanceId, destination: 23 }, repository);

    await expect(repository.get("run-player-half", "tenant-a")).resolves.toMatchObject({
      revision: 2,
      board: [heroC, ...Array(10).fill(null), heroD],
    });
  });

  it("rejects destinations outside the global player half", async () => {
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-invalid-player-cell", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8,
      commandResponses: {}, bench: [heroC], board: Array(12).fill(null),
    });

    await expect(applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-invalid-player-cell", commandId: "move-enemy-cell", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroC.instanceId, destination: 11 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-invalid-player-cell", commandId: "move-past-board", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroC.instanceId, destination: 24 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
  });
});
