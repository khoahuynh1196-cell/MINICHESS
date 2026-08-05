import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { compileRuleset } from "@auto-battler/game-core";
import type { RunCommandDependencies, RunRecord, RunRepository, ShopGenerator } from "../../src/application/run-commands.js";

export const productionRulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
export const productionRules = compileRuleset(JSON.parse(readFileSync(productionRulesPath, "utf8")));

export function rulesRun<T>(run: T): T & { readonly rulesetVersion: string } {
  const record = run as unknown as Record<string, unknown>;
  const lockedSnapshot = typeof record.lockedSnapshot === "object" && record.lockedSnapshot !== null
    ? Object.freeze({ ...(record.lockedSnapshot as Record<string, unknown>), rulesetVersion: productionRules.version })
    : record.lockedSnapshot;
  return Object.freeze({
    ...record,
    rulesetVersion: productionRules.version,
    ...(lockedSnapshot === undefined ? {} : { lockedSnapshot }),
  }) as unknown as T & { readonly rulesetVersion: string };
}

export function rulesAwareRepository(repository: RunRepository): RunRepository {
  return Object.freeze({
    async get(runId: string, tenantId: string) {
      const run = await repository.get(runId, tenantId);
      return run === undefined || run.rulesetVersion !== undefined ? run : rulesRun(run) as RunRecord;
    },
    async findActiveByTenant(tenantId: string) {
      const run = await repository.findActiveByTenant(tenantId);
      return run === undefined || run.rulesetVersion !== undefined ? run : rulesRun(run) as RunRecord;
    },
    save: (run: RunRecord) => repository.save(run),
    saveIfRevision: (run: RunRecord, expectedRevision: number) => repository.saveIfRevision(run, expectedRevision),
  });
}

export function runDependencies(repository: RunRepository, shopGenerator?: ShopGenerator): RunCommandDependencies {
  return Object.freeze({
    repository: rulesAwareRepository(repository),
    ...(shopGenerator === undefined ? {} : { shopGenerator }),
    ruleset: productionRules,
  });
}

export function createRunInput(input: { readonly id: string; readonly tenantId: string; readonly contentVersion: string }) {
  return Object.freeze({ ...input, rulesetVersion: productionRules.version });
}
