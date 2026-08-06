import { stableStringify } from "../serialization/canonical-json.js";
import type { AdventureRewardPlan } from "./rewards.js";
import { freezeAdventureRoster } from "./roster.js";
import type { AdventureShopPool } from "./shop.js";
import type { AdventureRunState } from "./types.js";

export interface AdventureMutationBase {
  readonly commandId: string;
  readonly expectedRevision: number;
}

export interface AdventureCommandReceipt {
  readonly fingerprint: string;
  readonly revision: number;
}

export interface AdventureCombatSummary {
  readonly round: number;
  readonly winner: "player" | "enemy";
  readonly survivingEnemyUnits: number;
  readonly resultHash: string;
  readonly finalTick: number;
  readonly reason: "elimination" | "timeout";
}

export interface AdventureGameState {
  readonly seed: string;
  readonly run: AdventureRunState;
  readonly shopPool: AdventureShopPool;
  readonly refreshNumber: number;
  readonly acquisitionCounter: number;
  readonly pendingReward?: AdventureRewardPlan;
  readonly lastCombat?: AdventureCombatSummary;
  readonly commandHistory: Readonly<Record<string, AdventureCommandReceipt>>;
}

export interface AdventureMutationResult {
  readonly state: AdventureGameState;
  readonly revision: number;
  readonly replayed: boolean;
}

function freezeRewardPlan(plan: AdventureRewardPlan): AdventureRewardPlan {
  return Object.freeze({
    ...plan,
    offers: Object.freeze(plan.offers.map((offer) => Object.freeze({
      ...offer,
      options: Object.freeze(offer.options.map((option) => Object.freeze({ ...option }))),
    }))),
  });
}

function freezeRun(run: AdventureRunState): AdventureRunState {
  const roster = freezeAdventureRoster(run);
  return Object.freeze({
    ...run,
    ...roster,
    shop: Object.freeze(run.shop.map((slot) => slot === null ? null : Object.freeze({ ...slot }))),
    rewardHeroes: Object.freeze(run.rewardHeroes.map((hero) => Object.freeze({ ...hero }))),
  });
}

export function freezeAdventureGameState(state: AdventureGameState): AdventureGameState {
  if (state.seed.length === 0) throw new Error("Adventure game seed must not be empty");
  return Object.freeze({
    ...state,
    run: freezeRun(state.run),
    ...(state.pendingReward === undefined ? {} : { pendingReward: freezeRewardPlan(state.pendingReward) }),
    ...(state.lastCombat === undefined ? {} : { lastCombat: Object.freeze({ ...state.lastCombat }) }),
    commandHistory: Object.freeze(Object.fromEntries(Object.entries(state.commandHistory)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([commandId, receipt]) => [commandId, Object.freeze({ ...receipt })]))),
  });
}

function requireMutation(command: AdventureMutationBase): void {
  if (command.commandId.trim().length === 0) throw new Error("commandId must not be empty");
  if (!Number.isSafeInteger(command.expectedRevision) || command.expectedRevision < 0) {
    throw new Error("expectedRevision must be a safe integer >= 0");
  }
}

export function replayAdventureMutation(
  state: AdventureGameState,
  command: AdventureMutationBase,
): AdventureMutationResult | undefined {
  requireMutation(command);
  const fingerprint = stableStringify(command);
  const existing = state.commandHistory[command.commandId];
  if (existing !== undefined) {
    if (existing.fingerprint !== fingerprint) throw new Error("ADVENTURE_COMMAND_ID_REUSED");
    return Object.freeze({ state, revision: existing.revision, replayed: true });
  }
  if (command.expectedRevision !== state.run.revision) throw new Error("ADVENTURE_REVISION_CONFLICT");
  return undefined;
}

export function commitAdventureMutation(
  current: AdventureGameState,
  command: AdventureMutationBase,
  next: Omit<AdventureGameState, "commandHistory">,
): AdventureMutationResult {
  const replay = replayAdventureMutation(current, command);
  if (replay !== undefined) return replay;
  const revision = current.run.revision + 1;
  const fingerprint = stableStringify(command);
  const state = freezeAdventureGameState({
    ...next,
    run: { ...next.run, revision },
    commandHistory: {
      ...current.commandHistory,
      [command.commandId]: Object.freeze({ fingerprint, revision }),
    },
  });
  return Object.freeze({ state, revision, replayed: false });
}
