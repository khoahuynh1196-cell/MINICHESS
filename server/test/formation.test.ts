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
    await expect(applyRunCommand({ actorId: "actor-a", tenantId: "tenant-a", runId: "run-combat-formation", commandId: "combat-move", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroA.instanceId, destination: 12 }, repository)).rejects.toThrow("COMMAND_NOT_ALLOWED");
  });
});
