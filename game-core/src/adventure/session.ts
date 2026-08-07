import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledOfflineRelease } from "../compatibility/release.js";
import type { CompiledRuleset } from "../rules/types.js";
import {
  resolveAdventureCombat,
  type AdventureCombatEngine,
  type AdventureCombatResolutionResult,
} from "./engine.js";
import {
  ackAdventurePlaybackComplete,
  claimAdventureRoundReward,
  type AdventureCombatResolutionCommand,
  type AdventurePlaybackAckCommand,
  type AdventureRewardClaimCommand,
} from "./lifecycle.js";
import {
  applyAdventureCommand,
  createAdventureGame,
  type AdventureCommand,
} from "./reducer.js";
import {
  decodeAdventureSave,
  encodeAdventureSave,
  type AdventureSaveContext,
} from "./save.js";
import type {
  AdventureGameState,
  AdventureMutationResult,
} from "./state.js";
import { buildAdventureView, type AdventureView } from "./view.js";

export interface AdventureStateStore {
  load(): string | undefined | Promise<string | undefined>;
  save(encoded: string): void | Promise<void>;
  clear(): void | Promise<void>;
}

export interface AdventureSessionDependencies {
  readonly release: CompiledOfflineRelease;
  readonly rules: CompiledRuleset;
  readonly content: CompiledContentBundle;
  readonly assetRevision: string;
  readonly clientSchema: number;
  readonly combatEngine: AdventureCombatEngine;
  readonly store: AdventureStateStore;
}

export interface CreateAdventureSessionInput {
  readonly id: string;
  readonly seed: string;
}

export class AdventureSession {
  readonly #dependencies: AdventureSessionDependencies;
  #state: AdventureGameState | undefined;

  constructor(dependencies: AdventureSessionDependencies) {
    this.#dependencies = Object.freeze({ ...dependencies });
  }

  get state(): AdventureGameState {
    if (this.#state === undefined) throw new Error("ADVENTURE_SESSION_NOT_STARTED");
    return this.#state;
  }

  get hasState(): boolean {
    return this.#state !== undefined;
  }

  get view(): AdventureView {
    return buildAdventureView(this.state, this.#dependencies.rules, this.#dependencies.content);
  }

  #saveContext(): AdventureSaveContext {
    return {
      release: this.#dependencies.release,
      rules: this.#dependencies.rules,
      content: this.#dependencies.content,
      assetRevision: this.#dependencies.assetRevision,
      clientSchema: this.#dependencies.clientSchema,
    };
  }

  async start(input: CreateAdventureSessionInput): Promise<AdventureGameState> {
    if (this.#state !== undefined) throw new Error("ADVENTURE_SESSION_ALREADY_STARTED");
    this.#state = createAdventureGame({
      id: input.id,
      seed: input.seed,
      content: this.#dependencies.content,
      rules: this.#dependencies.rules,
    });
    await this.#persist();
    return this.#state;
  }

  async restore(): Promise<AdventureGameState | undefined> {
    if (this.#state !== undefined) throw new Error("ADVENTURE_SESSION_ALREADY_STARTED");
    const encoded = await this.#dependencies.store.load();
    if (encoded === undefined) return undefined;
    this.#state = decodeAdventureSave(encoded, this.#saveContext());
    return this.#state;
  }

  async dispatch(command: AdventureCommand): Promise<AdventureMutationResult> {
    const result = applyAdventureCommand(
      this.state,
      command,
      this.#dependencies.rules,
    );
    await this.#accept(result);
    return result;
  }

  async resolveCombat(command: AdventureCombatResolutionCommand): Promise<AdventureCombatResolutionResult> {
    const result = await resolveAdventureCombat(
      this.state,
      command,
      this.#dependencies.combatEngine,
      this.#dependencies.rules,
      this.#dependencies.content,
    );
    await this.#accept(result);
    return result;
  }

  async claimReward(command: AdventureRewardClaimCommand): Promise<AdventureMutationResult> {
    const result = claimAdventureRoundReward(
      this.state,
      command,
      this.#dependencies.rules,
      this.#dependencies.content,
    );
    await this.#accept(result);
    return result;
  }

  async ackPlaybackComplete(command: AdventurePlaybackAckCommand): Promise<AdventureMutationResult> {
    const result = ackAdventurePlaybackComplete(
      this.state,
      command,
      this.#dependencies.rules,
      this.#dependencies.content,
    );
    await this.#accept(result);
    return result;
  }

  async persist(): Promise<void> {
    await this.#persist();
  }

  async reset(): Promise<void> {
    this.#state = undefined;
    await this.#dependencies.store.clear();
  }

  async #accept(result: AdventureMutationResult): Promise<void> {
    this.#state = result.state;
    if (!result.replayed) await this.#persist();
  }

  async #persist(): Promise<void> {
    const encoded = encodeAdventureSave(this.state, this.#saveContext());
    await this.#dependencies.store.save(encoded);
  }
}
