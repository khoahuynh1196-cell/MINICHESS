import type { RunRecord, RunRepository } from "../application/run-commands.js";

export interface SqlQueryResult<Row> {
  readonly rows: readonly Row[];
}

export interface SqlQueryClient {
  query(text: string, values: readonly unknown[]): Promise<SqlQueryResult<unknown>>;
}

interface StoredRunRow {
  readonly run_state: unknown;
}

function storedRun(row: StoredRunRow | undefined): RunRecord | undefined {
  if (row === undefined || typeof row.run_state !== "object" || row.run_state === null || Array.isArray(row.run_state)) return undefined;
  return row.run_state as RunRecord;
}

/**
 * Persists the complete authoritative state in one transactionally versioned
 * JSON document. Related event/audit tables remain append-only projections.
 */
export function createPostgresRunRepository(client: SqlQueryClient): RunRepository {
  return Object.freeze({
    async get(runId: string, tenantId: string): Promise<RunRecord | undefined> {
      const result = await client.query(
        "select run_state from public.authoritative_run_states where run_id = $1 and tenant_id = $2",
        [runId, tenantId],
      );
      return storedRun(result.rows[0] as StoredRunRow | undefined);
    },
    async findActiveByTenant(tenantId: string): Promise<RunRecord | undefined> {
      const result = await client.query(
        "select run_state from public.authoritative_run_states where tenant_id = $1 and run_state ->> 'state' != 'COMPLETE' order by updated_at desc limit 1",
        [tenantId],
      );
      return storedRun(result.rows[0] as StoredRunRow | undefined);
    },
    async save(run: RunRecord): Promise<void> {
      await client.query(
        "insert into public.authoritative_run_states (run_id, tenant_id, revision, run_state) values ($1, $2, $3, $4::jsonb)",
        [run.id, run.tenantId, run.revision, run],
      );
    },
    async saveIfRevision(run: RunRecord, expectedRevision: number): Promise<RunRecord | undefined> {
      const result = await client.query(
        "update public.authoritative_run_states set revision = ($4::jsonb ->> 'revision')::bigint, run_state = $4::jsonb, updated_at = now() where run_id = $1 and tenant_id = $2 and revision = $3 returning run_state",
        [run.id, run.tenantId, expectedRevision, run],
      );
      return result.rows.length === 0 ? undefined : run;
    },
  });
}
