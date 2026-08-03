import { describe, expect, test } from "vitest";

describe("Postgres run persistence", () => {
  test("persists a complete tenant-scoped run state with optimistic revision checks", async () => {
    const module = await import("../src/infra/postgres-run-repository.js");
    const factory = module.createPostgresRunRepository;
    expect(typeof factory).toBe("function");
    if (typeof factory !== "function") return;

    const queries: Array<{ text: string; values: readonly unknown[] }> = [];
    const state = {
      id: "run-alpha",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE" as const,
      round: 1,
      revision: 0,
      gold: 8,
      health: 30,
      runSeed: "1".repeat(64),
      commandResponses: {},
      bench: [],
      board: Array(12).fill(null),
    };
    const client = {
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("insert")) return { rows: [] };
        if (text.startsWith("update")) return { rows: [{ run_state: state }] };
        return { rows: [{ run_state: state }] };
      },
    };
    const repository = factory(client);

    await repository.save(state);
    const loaded = await repository.get("run-alpha", "tenant-a");
    const saved = await repository.saveIfRevision({ ...state, gold: 6, revision: 1 }, 0);

    expect(loaded).toEqual(state);
    expect(saved).toEqual({ ...state, gold: 6, revision: 1 });
    expect(queries).toHaveLength(3);
    expect(queries[0]?.values).toEqual(["run-alpha", "tenant-a", 0, state]);
    expect(queries[1]?.values).toEqual(["run-alpha", "tenant-a"]);
    expect(queries[2]?.values).toEqual(["run-alpha", "tenant-a", 0, { ...state, gold: 6, revision: 1 }]);
  });
});
