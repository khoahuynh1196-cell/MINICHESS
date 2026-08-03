import { Pool } from "pg";
import { createPostgresRunRepository } from "./postgres-run-repository.js";

export interface PostgresRuntime {
  readonly repository: ReturnType<typeof createPostgresRunRepository>;
  close(): Promise<void>;
}

/** Opens a server-only pool. Browser clients never receive this connection. */
export function createPostgresRuntime(connectionString: string): PostgresRuntime {
  const pool = new Pool({ connectionString });
  return Object.freeze({
    repository: createPostgresRunRepository({
      query: async (text, values) => pool.query(text, [...values]),
    }),
    close: () => pool.end(),
  });
}
