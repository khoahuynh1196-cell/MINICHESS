import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";
import {
  recordAdventureCombatResult,
  type AdventureCombatOutcome,
  type AdventureCombatResolutionCommand,
} from "./lifecycle.js";
import { assertAdventureCombatPlayback, type AdventureCombatPlayback } from "./playback.js";
import { buildAdventureCombatSnapshot, type AdventureCombatSnapshot } from "./snapshot.js";
import type { AdventureCommandReceipt, AdventureGameState, AdventureMutationResult } from "./state.js";

export interface AdventureCombatEngineRequest {
  readonly snapshot: AdventureCombatSnapshot;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
}

export interface AdventureCombatEngineResult {
  readonly outcome: AdventureCombatOutcome;
  readonly playback: AdventureCombatPlayback;
}

export interface AdventureCombatEngine {
  resolve(request: AdventureCombatEngineRequest): AdventureCombatEngineResult | Promise<AdventureCombatEngineResult>;
}

export interface AdventureCombatResolutionResult extends AdventureMutationResult {
  readonly playback: AdventureCombatPlayback;
}

function checkResolveReplay(
  state: AdventureGameState,
  command: AdventureCombatResolutionCommand,
): AdventureCommandReceipt | undefined {
  if (command.commandId.trim().length === 0) throw new Error("commandId must not be empty");
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw new Error("expectedRevision must be a safe integer >= 0");
  }
  const existing = state.commandHistory[command.commandId];
  if (existing !== undefined) return existing;
  if (command.expectedRevision !== state.run.revision) throw new Error("ADVENTURE_REVISION_CONFLICT");
  return undefined;
}

/**
 * Resolves one combat through an injected engine. A repeated command is served
 * from the authoritative receipt before the engine or snapshot builder runs.
 *
 * The public `RESOLVE_COMBAT` command carries no outcome data (the engine has
 * not run yet), while the persisted `RECORD_COMBAT_RESULT` command derived
 * from the engine's result does. Both share the same `commandId`, so replay
 * detection here checks receipt presence only rather than the strict
 * fingerprint match `replayAdventureMutation` uses elsewhere; a genuine
 * retry always resends the identical `RESOLVE_COMBAT` shape, so no fingerprint
 * comparison is needed to distinguish it from a first attempt.
 */
export async function resolveAdventureCombat(
  state: AdventureGameState,
  command: AdventureCombatResolutionCommand,
  engine: AdventureCombatEngine,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): Promise<AdventureCombatResolutionResult> {
  const existing = checkResolveReplay(state, command);
  if (existing !== undefined) {
    const playback = state.lastCombat?.playback;
    if (playback === undefined) throw new Error("ADVENTURE_COMBAT_REPLAY_MISSING_PLAYBACK");
    return { state, revision: existing.revision, replayed: true, playback };
  }
  const snapshot = buildAdventureCombatSnapshot(state, rules, content);
  const { outcome, playback } = await engine.resolve(Object.freeze({ snapshot, rules, content }));
  if (outcome.round !== snapshot.round) throw new Error("ADVENTURE_ENGINE_ROUND_MISMATCH");
  assertAdventureCombatPlayback(playback, snapshot);
  const finalEvent = playback.events.at(-1);
  if (finalEvent?.payload.winner !== outcome.winner) throw new Error("ADVENTURE_PLAYBACK_WINNER_MISMATCH");
  if (finalEvent?.tick !== outcome.finalTick) throw new Error("ADVENTURE_PLAYBACK_TICK_MISMATCH");
  const result = recordAdventureCombatResult(state, {
    commandId: command.commandId,
    expectedRevision: command.expectedRevision,
    type: "RECORD_COMBAT_RESULT",
    round: outcome.round,
    winner: outcome.winner,
    survivingEnemyUnits: outcome.survivingEnemyUnits,
    resultHash: outcome.resultHash,
    finalTick: outcome.finalTick,
    reason: outcome.reason,
    playback,
  }, rules, content);
  return { ...result, playback };
}
