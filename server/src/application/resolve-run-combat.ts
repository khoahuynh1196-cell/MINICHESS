import type { CompiledContentBundle } from "@auto-battler/game-core";
import { resolveContentCombat } from "./combat-resolution.js";
import { attachContentRoundRewards, recordResolvedCombat } from "./round-lifecycle.js";
import type { RunRecord } from "./run-commands.js";

export interface ResolveRunCombatInput {
  readonly tenantId: string;
  readonly runId: string;
}

export interface ImmutableContentRepository {
  getByVersion(version: string): Promise<CompiledContentBundle | undefined>;
}

export interface ResolveRunCombatDependencies {
  readonly repository: CombatResolutionRunRepository;
  readonly contentRepository: ImmutableContentRepository;
}

export interface CombatResolutionRunRepository {
  get(runId: string, tenantId: string): Promise<RunRecord | undefined>;
  saveIfRevision(run: RunRecord, expectedRevision: number): Promise<RunRecord | undefined>;
}

function validateResolutionInput(run: RunRecord, content: CompiledContentBundle): void {
  if (run.lockedSnapshot === undefined || run.lockedSnapshot.runId !== run.id) throw new Error("COMMAND_NOT_ALLOWED");
  if (run.lockedSnapshot.combatId === undefined || run.lockedSnapshot.combatSeed === undefined || run.lockedSnapshot.rulesetVersion === undefined) throw new Error("COMMAND_NOT_ALLOWED");
  if (run.contentVersion !== content.version || run.lockedSnapshot.contentVersion !== content.version) throw new Error("CONTENT_VERSION_MISMATCH");
}

export async function resolveRunCombat(input: ResolveRunCombatInput, dependencies: ResolveRunCombatDependencies): Promise<RunRecord> {
  const { repository, contentRepository } = dependencies;
  const run = await repository.get(input.runId, input.tenantId);
  if (run === undefined) throw new Error("RUN_NOT_FOUND");
  if (run.state === "REWARD" && run.combatRecord !== undefined) return run;
  if (run.state !== "COMBAT") throw new Error("COMMAND_NOT_ALLOWED");
  if (run.lockedSnapshot === undefined) throw new Error("COMMAND_NOT_ALLOWED");
  const content = await contentRepository.getByVersion(run.lockedSnapshot.contentVersion);
  if (content === undefined) throw new Error("CONTENT_VERSION_MISMATCH");
  validateResolutionInput(run, content);

  const { result } = resolveContentCombat({
    content,
    lockedSnapshot: run.lockedSnapshot!,
    combatId: run.lockedSnapshot.combatId!,
    combatSeed: run.lockedSnapshot.combatSeed!,
    rulesetVersion: run.lockedSnapshot.rulesetVersion!,
  });
  const resolvedRun = attachContentRoundRewards(recordResolvedCombat(run, result), content);
  const persisted = await repository.saveIfRevision(resolvedRun, run.revision);
  if (persisted !== undefined) return persisted;
  const latest = await repository.get(input.runId, input.tenantId);
  if (latest?.state === "REWARD" && latest.combatRecord !== undefined) return latest;
  throw new Error("RUN_RESOLUTION_CONFLICT");
}
