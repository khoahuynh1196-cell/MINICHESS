import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import {
  recordAdventureCombatResult,
  type AdventureCombatOutcome,
  type AdventureCombatResolutionCommand,
} from "./lifecycle.js";
import {
  replayAdventureMutation,
  type AdventureGameState,
  type AdventureMutationResult,
} from "./state.js";

export interface AdventureCombatEngineRequest {
  readonly state: AdventureGameState;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
}

export interface AdventureCombatEngine {
  resolve(request: AdventureCombatEngineRequest): AdventureCombatOutcome | Promise<AdventureCombatOutcome>;
}

/**
 * Resolves one combat through an injected engine. A repeated command is served
 * from the authoritative receipt before the engine is called again.
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
  const outcome = await engine.resolve(Object.freeze({ state, rules, content }));
  return recordAdventureCombatResult(state, command, outcome, rules, content);
}
