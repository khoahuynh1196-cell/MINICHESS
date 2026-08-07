import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import {
  recordAdventureCombatResult,
  type AdventureCombatOutcome,
  type AdventureCombatResolutionCommand,
} from "./lifecycle.js";
import { buildAdventureCombatSnapshot, type AdventureCombatSnapshot } from "./snapshot.js";
import {
  replayAdventureMutation,
  type AdventureGameState,
  type AdventureMutationResult,
} from "./state.js";

export interface AdventureCombatEngineRequest {
  readonly snapshot: AdventureCombatSnapshot;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
}

export interface AdventureCombatEngine {
  resolve(request: AdventureCombatEngineRequest): AdventureCombatOutcome | Promise<AdventureCombatOutcome>;
}

/**
 * Resolves one combat through an injected engine. A repeated command is served
 * from the authoritative receipt before the engine or snapshot builder runs.
 */
export async function resolveAdventureCombat(
  state: AdventureGameState,
  command: AdventureCombatResolutionCommand,
  engine: AdventureCombatEngine,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): Promise<AdventureMutationResult> {
  const replay = replayAdventureMutation(state, command);
  if (replay !== undefined) return replay;
  const snapshot = buildAdventureCombatSnapshot(state, rules, content);
  const outcome = await engine.resolve(Object.freeze({ snapshot, rules, content }));
  if (outcome.round !== snapshot.round) throw new Error("ADVENTURE_ENGINE_ROUND_MISMATCH");
  return recordAdventureCombatResult(state, command, outcome, rules, content);
}
