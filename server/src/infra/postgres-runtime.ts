import { Pool } from "pg";
import { createPostgresRunRepository } from "./postgres-run-repository.js";
import { createPostgresOnlinePersistence, type SqlOnlinePersistenceClient } from "./postgres-online-persistence.js";

export interface PostgresRuntime {
  readonly repository: ReturnType<typeof createPostgresRunRepository>;
  readonly onlinePersistence: ReturnType<typeof createPostgresOnlinePersistence>;
  close(): Promise<void>;
}

/** Opens a server-only pool. Browser clients never receive this connection. */
export function createPostgresRuntime(connectionString: string): PostgresRuntime {
  const pool = new Pool({ connectionString });
  return Object.freeze({
    repository: createPostgresRunRepository({
      query: async (text, values) => pool.query(text, [...values]),
    }),
    onlinePersistence: createPostgresOnlinePersistence({
      query: async (text, values) => pool.query(text, [...values]),
      transaction: async <T>(work: (transaction: SqlOnlinePersistenceClient) => Promise<T>) => {
        const connection = await pool.connect();
        try {
          await connection.query("begin");
          const transactionClient: SqlOnlinePersistenceClient = {
            query: async (text, values) => connection.query(text, [...values]),
            transaction: async (nestedWork) => nestedWork(transactionClient),
          };
          const result = await work(transactionClient);
          await connection.query("commit");
          return result;
        } catch (error) {
          await connection.query("rollback");
          throw error;
        } finally {
          connection.release();
        }
      },
    }),
    close: () => pool.end(),
  });
}
