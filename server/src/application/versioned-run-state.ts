import { readVersionedRunState } from "@auto-battler/game-core";
import type { RunRecord } from "./run-commands.js";

export function canonicalizePersistedRun(value: unknown): RunRecord | undefined {
  const result = readVersionedRunState(value);
  if (result.kind === "REJECTED") return undefined;
  if (result.kind === "CANONICAL") return result.view as unknown as RunRecord;
  return {
    ...(result.view as unknown as RunRecord),
    contentVersion: result.contentVersion,
  };
}
