import { describe, expect, test } from "vitest";

const CANONICAL_RULESET_VERSION = "production-4x6-0.1.0";
const CANONICAL_CONTENT_VERSION = "alpha-0.4.0";

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
      contentVersion: CANONICAL_CONTENT_VERSION,
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
    let storedState: unknown;
    const client = {
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("insert")) {
          storedState = values[3];
          return { rows: [] };
        }
        if (text.startsWith("update")) {
          storedState = values[3];
          return { rows: [{ run_state: storedState }] };
        }
        return { rows: [{ run_state: storedState }] };
      },
    };
    const repository = factory(client);

    await repository.save(state);
    const loaded = await repository.get("run-alpha", "tenant-a");
    const saved = await repository.saveIfRevision({ ...state, gold: 6, revision: 1 }, 0);

    expect(loaded).toEqual(state);
    expect(saved).toEqual({ ...state, gold: 6, revision: 1 });
    expect(queries).toHaveLength(3);
    const envelope = { schema_version: CANONICAL_RULESET_VERSION, view: state };
    expect(queries[0]?.values).toEqual(["run-alpha", "tenant-a", 0, envelope]);
    expect(queries[1]?.values).toEqual(["run-alpha", "tenant-a"]);
    expect(queries[2]?.values).toEqual(["run-alpha", "tenant-a", 0, { schema_version: CANONICAL_RULESET_VERSION, view: { ...state, gold: 6, revision: 1 } }]);
  });

  test("migrates a valid legacy 4x8 envelope and rejects occupied tail cells", async () => {
    const module = await import("../src/infra/postgres-run-repository.js");
    const factory = module.createPostgresRunRepository;
    const legacyState = {
      id: "run-legacy",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE" as const,
      round: 1,
      revision: 0,
      gold: 8,
      health: 30,
      commandResponses: {},
      bench: [],
      board: [null, null, null, null, null, null, null, null, null, null, null, null, null, null, null, null],
    };
    let state: unknown = { schema_version: "alpha-0.3.0", view: legacyState };
    const client = { async query() { return { rows: [{ run_state: state }] }; } };
    const repository = factory(client);
    const migrated = await repository.get("run-legacy", "tenant-a");
    expect(migrated?.contentVersion).toBe(CANONICAL_CONTENT_VERSION);
    expect(migrated?.board).toHaveLength(12);

    state = { schema_version: "alpha-0.3.0", view: { ...legacyState, combatRecord: { events: [{ type: "UNIT_MOVED", payload: { from: 18, to: 19 } }] } } };
    expect((await repository.get("run-legacy", "tenant-a"))?.combatRecord?.events[0]?.payload).toMatchObject({ from: 14, to: 15 });

    state = { schema_version: "alpha-0.3.0", view: { ...legacyState, board: [...legacyState.board.slice(0, 12), { instanceId: "legacy-tail" }, null, null, null] } };
    await expect(repository.get("run-legacy", "tenant-a")).rejects.toThrow("INCOMPATIBLE_LEGACY_STATE");
  });
});
