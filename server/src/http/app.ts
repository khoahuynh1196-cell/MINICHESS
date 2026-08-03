import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { CompiledContentBundle } from "@auto-battler/game-core";
import { applyRunCommand, createInMemoryRunRepository, createRun, progressionForRun, type RunRecord, type RunRepository, type ShopGenerator } from "../application/run-commands.js";
import { shopOddsForLevel, type ShopTierOdds } from "../application/shop-pool.js";
import type { RewardSelection } from "../application/reward-selection.js";
import { resolveRunCombat } from "../application/resolve-run-combat.js";

type PublicRunView = Pick<RunRecord, "id" | "contentVersion" | "state" | "round" | "revision" | "gold" | "health" | "shop" | "shopLocked" | "bench" | "board" | "items" | "freeRefreshes" | "roundRewardPlan" | "rewardHeroes"> & ReturnType<typeof progressionForRun> & { readonly shopOdds: ShopTierOdds };

export interface ContentManifestRepository {
  getByVersion(version: string): Promise<CompiledContentBundle | undefined>;
}

function metadata(): { request_id: string; server_time: string } {
  return { request_id: randomUUID(), server_time: new Date().toISOString() };
}

function success<T>(data: T): { data: T; request_id: string; server_time: string } {
  return { data, ...metadata() };
}

function errorMessage(code: string): string {
  return ({
    RUN_REVISION_CONFLICT: "Run state changed. Refresh and retry.",
    RUN_NOT_FOUND: "Run was not found.",
    COMMAND_NOT_ALLOWED: "Command is not allowed in the current run state.",
    IDEMPOTENCY_KEY_REUSED: "Command ID was already used with different input.",
    GAME_RULE_VIOLATION: "Command violates a game rule.",
    REWARD_SELECTION_REQUIRED: "Choose one option for every pending reward.",
    REWARD_SELECTION_INVALID: "Reward selection is invalid.",
    INVALID_COMMAND: "Command payload is invalid.",
    ACTIVE_RUN_EXISTS: "Tenant already has an active run.",
    CONTENT_VERSION_NOT_FOUND: "Content version is not supported.",
  } as Readonly<Record<string, string>>)[code] ?? "Internal server error.";
}

function failure(code: string, retryable = false): { error: { code: string; message: string; retryable: boolean }; request_id: string } {
  return { error: { code, message: errorMessage(code), retryable }, request_id: randomUUID() };
}

function parseAfterSequence(value: string | undefined): number {
  if (value === undefined) return -1;
  if (!/^\d+$/.test(value)) throw new Error("INVALID_COMMAND");
  const sequence = Number(value);
  if (!Number.isSafeInteger(sequence)) throw new Error("INVALID_COMMAND");
  return sequence;
}

function parseRewardSelections(value: unknown): readonly RewardSelection[] | undefined {
  if (value === undefined) return undefined;
  if (!Array.isArray(value)) throw new Error("INVALID_COMMAND");
  return Object.freeze(value.map((selection) => {
    if (typeof selection !== "object" || selection === null || typeof (selection as Record<string, unknown>).offer_id !== "string" || typeof (selection as Record<string, unknown>).option_id !== "string") {
      throw new Error("INVALID_COMMAND");
    }
    return Object.freeze({ offerId: (selection as Record<string, unknown>).offer_id as string, optionId: (selection as Record<string, unknown>).option_id as string });
  }));
}

function toPublicRunView(run: RunRecord): PublicRunView {
  const progression = progressionForRun(run);
  return {
    id: run.id,
    contentVersion: run.contentVersion,
    state: run.state,
    ...(run.round === undefined ? {} : { round: run.round }),
    revision: run.revision,
    gold: run.gold,
    ...progression,
    shopOdds: shopOddsForLevel(progression.level),
    shopLocked: run.shopLocked ?? false,
    ...(run.health === undefined ? {} : { health: run.health }),
    ...(run.shop === undefined ? {} : { shop: run.shop }),
    ...(run.bench === undefined ? {} : { bench: run.bench }),
    ...(run.board === undefined ? {} : { board: run.board }),
    ...(run.items === undefined ? {} : { items: run.items }),
    ...(run.freeRefreshes === undefined ? {} : { freeRefreshes: run.freeRefreshes }),
    ...(run.roundRewardPlan === undefined ? {} : { roundRewardPlan: run.roundRewardPlan }),
    ...(run.rewardHeroes === undefined ? {} : { rewardHeroes: run.rewardHeroes }),
  };
}

export function createHttpApp(context = { actorId: "anonymous", tenantId: "default" }, repository: RunRepository = createInMemoryRunRepository(), shopGenerator?: ShopGenerator, contentRepository?: ContentManifestRepository) {
  const app = Fastify();
  app.setErrorHandler((error, _request, reply) => {
    const code = error.message;
    const statusCode = code === "RUN_REVISION_CONFLICT" || code === "COMMAND_NOT_ALLOWED" || code === "IDEMPOTENCY_KEY_REUSED" || code === "ACTIVE_RUN_EXISTS" ? 409 : code === "RUN_NOT_FOUND" ? 404 : code === "GAME_RULE_VIOLATION" || code === "REWARD_SELECTION_REQUIRED" || code === "REWARD_SELECTION_INVALID" ? 422 : code === "INVALID_COMMAND" ? 400 : 500;
    const responseCode = statusCode === 500 ? "INTERNAL_ERROR" : code;
    return reply.code(statusCode).send(failure(responseCode, code === "RUN_REVISION_CONFLICT"));
  });
  app.get("/health", async () => ({ status: "ok" }));
  app.get<{ Params: { contentVersion: string } }>("/v1/content/:contentVersion/manifest", async (request, reply) => {
    const content = await contentRepository?.getByVersion(request.params.contentVersion);
    if (content === undefined) return reply.code(404).send(failure("CONTENT_VERSION_NOT_FOUND"));
    return success({ content_version: content.version, content_hash: content.contentHash, manifest: content.manifest });
  });
  app.post<{ Body: { id: string; content_version: string } }>("/v1/runs", async (request, reply) => {
    const content = contentRepository === undefined ? undefined : await contentRepository.getByVersion(request.body.content_version);
    if (contentRepository !== undefined && content === undefined) return reply.code(404).send(failure("CONTENT_VERSION_NOT_FOUND"));
    const run = await createRun(
      { id: request.body.id, tenantId: context.tenantId, contentVersion: request.body.content_version },
      repository,
      shopGenerator,
      content === undefined ? undefined : { uniqueItemIds: content.uniqueItems.map((item) => item.id) },
    );
    return reply.code(201).send(success(toPublicRunView(run)));
  });
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId", async (request, reply) => {
    const run = await repository.get(request.params.runId, context.tenantId);
    if (run === undefined) return reply.code(404).send(failure("RUN_NOT_FOUND"));
    return success(toPublicRunView(run));
  });
  app.get<{ Params: { runId: string } }>("/v1/runs/:runId/resume", async (request, reply) => {
    const run = await repository.get(request.params.runId, context.tenantId);
    if (run === undefined) return reply.code(404).send(failure("RUN_NOT_FOUND"));
    const latestEventSequence = (run.combatRecord?.events ?? []).reduce((latest, event) => Math.max(latest, event.sequence), -1);
    return success({ run_view: toPublicRunView(run), latest_event_sequence: latestEventSequence });
  });
  app.get<{ Params: { runId: string }; Querystring: { after_sequence?: string } }>("/v1/runs/:runId/events", async (request, reply) => {
    const run = await repository.get(request.params.runId, context.tenantId);
    if (run === undefined) return reply.code(404).send(failure("RUN_NOT_FOUND"));
    const afterSequence = parseAfterSequence(request.query.after_sequence);
    return success({ events: (run.combatRecord?.events ?? []).filter((event) => event.sequence > afterSequence) });
  });
  app.post<{ Params: { runId: string } }>("/v1/runs/:runId/resolve-combat", async (request, reply) => {
    if (contentRepository === undefined) return reply.code(404).send(failure("CONTENT_VERSION_NOT_FOUND"));
    const run = await resolveRunCombat(
      { runId: request.params.runId, tenantId: context.tenantId },
      { repository, contentRepository },
    );
    return success(toPublicRunView(run));
  });
  app.post<{ Params: { runId: string }; Body: { command_id: string; expected_run_revision: number; type: "REFRESH_SHOP" | "LOCK_SHOP" | "ABANDON_RUN" | "BUY_XP" | "BUY_SHOP_HERO" | "SELL_HERO" | "MOVE_HERO" | "EQUIP_ITEM" | "UNEQUIP_ITEM" | "START_ROUND" | "CLAIM_ROUND_REWARD" | "ACK_UNIQUE_REVEAL" | "CLAIM_REWARD_HERO"; shop_slot_index?: number; hero_instance_id?: string; item_instance_id?: string; destination?: number; reveal_id?: string; reward_selections?: unknown } }>("/v1/runs/:runId/commands", async (request) => {
    const rewardSelections = parseRewardSelections(request.body.reward_selections);
    return success(await applyRunCommand({ actorId: context.actorId, tenantId: context.tenantId, runId: request.params.runId, commandId: request.body.command_id, expectedRevision: request.body.expected_run_revision, type: request.body.type, ...(request.body.shop_slot_index === undefined ? {} : { shopSlotIndex: request.body.shop_slot_index }), ...(request.body.hero_instance_id === undefined ? {} : { heroInstanceId: request.body.hero_instance_id }), ...(request.body.item_instance_id === undefined ? {} : { itemInstanceId: request.body.item_instance_id }), ...(request.body.destination === undefined ? {} : { destination: request.body.destination }), ...(request.body.reveal_id === undefined ? {} : { revealId: request.body.reveal_id }), ...(rewardSelections === undefined ? {} : { rewardSelections }) }, repository, shopGenerator));
  });
  return app;
}
