import { describe, expect, test } from "vitest";

describe("PostgreSQL runtime wiring", () => {
  test("creates a server-owned pooled repository from a DATABASE_URL", async () => {
    const module = await import("../src/infra/postgres-runtime.js").catch(() => undefined) as undefined | { createPostgresRuntime(connectionString: string): { repository: { get: unknown }; close(): Promise<void> } };
    expect(module).toBeDefined();
    if (module === undefined) return;

    const runtime = module.createPostgresRuntime("postgresql://user:password@127.0.0.1:5432/auto_battler");
    expect(typeof runtime.repository.get).toBe("function");
    await runtime.close();
  });
});
