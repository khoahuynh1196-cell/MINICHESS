import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import { PLAYER_FORMATION_SIZE, type CompiledContentBundle } from "@auto-battler/game-core";
import { applyRunCommand, assertCanonicalContentVersion, createInMemoryRunRepository, createRun, progressionForRun, type RunRecord, type RunRecap, type RunRepository, type ShopGenerator } from "../application/run-commands.js";
import { shopOddsForLevel, type ShopTierOdds } from "../application/shop-pool.js";
import type { RewardSelection } from "../application/reward-selection.js";
import { resolveRunCombat } from "../application/resolve-run-combat.js";
import type { OnlineRuntime } from "../online/runtime.js";
import { createRateLimiter } from "../security/rate-limit.js";

type PublicRunView = Pick<RunRecord, "id" | "contentVersion" | "state" | "round" | "revision" | "gold" | "health" | "shop" | "shopLocked" | "bench" | "board" | "items" | "freeRefreshes" | "roundRewardPlan" | "rewardHeroes" | "recap"> & ReturnType<typeof progressionForRun> & { readonly shopOdds: ShopTierOdds };

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
     INCOMPATIBLE_LEGACY_STATE: "Saved run is incompatible with the canonical 4x6 ruleset.",
     DEVICE_ID_REQUIRED: "A device identifier is required.",
     MATCHMAKING_INPUT_REQUIRED: "Region and mode are required for matchmaking.",
     TICKET_NOT_FOUND: "Match ticket was not found.",
     MATCH_TICKET_EXISTS: "Player already has an active match ticket.",
     INVALID_REALTIME_ENVELOPE: "Realtime envelope is invalid.",
     ROOM_COMMAND_INPUT_REQUIRED: "Room command fields are required.",
     ROOM_RECOVERY_INPUT_REQUIRED: "Room recovery fields are required.",
     REFRESH_PLAYER_MISMATCH: "Refresh session does not belong to this player.",
     INVALID_COMBAT_RESULT: "Combat result fields are required.",
     DUPLICATE_COMBAT_RESULT: "Combat result was already recorded.",
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

function bearer(request: { readonly headers: { readonly authorization?: string | string[] | undefined } }, onlineRuntime: OnlineRuntime): { readonly playerId: string } {
  const header = request.headers.authorization;
  if (typeof header !== "string" || !header.startsWith("Bearer ")) throw new Error("AUTH_REQUIRED");
  return onlineRuntime.verifyAccess(header.slice("Bearer ".length));
}

function publicRoom(room: { readonly roomId: string; readonly players: readonly string[]; readonly region: string; readonly mode: string; readonly maxPlayers: 8; readonly phase: string; readonly lease: { readonly fencingToken: number; readonly acquiredAt: number }; readonly rulesetVersion: string; readonly contentVersion: string; readonly assetManifestVersion: string }) {
  return { room_id: room.roomId, players: room.players, region: room.region, mode: room.mode, max_players: room.maxPlayers, phase: room.phase, lease: { fencing_token: room.lease.fencingToken, acquired_at: room.lease.acquiredAt }, ruleset_version: room.rulesetVersion, content_version: room.contentVersion, asset_manifest_version: room.assetManifestVersion };
}

function publicBoard(board: NonNullable<RunRecord["board"]>): NonNullable<RunRecord["board"]> {
  return [...board.slice(0, PLAYER_FORMATION_SIZE), ...Array(Math.max(0, PLAYER_FORMATION_SIZE - board.length)).fill(null)];
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
    ...(run.board === undefined ? {} : { board: publicBoard(run.board) }),
    ...(run.items === undefined ? {} : { items: run.items }),
    ...(run.freeRefreshes === undefined ? {} : { freeRefreshes: run.freeRefreshes }),
    ...(run.roundRewardPlan === undefined ? {} : { roundRewardPlan: run.roundRewardPlan }),
    ...(run.rewardHeroes === undefined ? {} : { rewardHeroes: run.rewardHeroes }),
	...(run.recap === undefined ? {} : { recap: run.recap }),
  };
}

export function createHttpApp(context = { actorId: "anonymous", tenantId: "default" }, repository: RunRepository = createInMemoryRunRepository(), shopGenerator?: ShopGenerator, contentRepository?: ContentManifestRepository, onlineRuntime?: OnlineRuntime) {
  const app = Fastify();
  const onlineRateLimiter = createRateLimiter({ limit: 120, windowMs: 60_000 });
  const onlineRequestGuard = (request: { readonly ip?: string; readonly headers: { readonly authorization?: string | string[] | undefined } }) => {
    const authorization = request.headers.authorization;
    const key = typeof authorization === "string" && authorization.startsWith("Bearer ") ? authorization.slice("Bearer ".length, 64) : request.ip ?? "anonymous";
    const result = onlineRateLimiter.allow(key);
    if (!result.allowed) {
      const error = new Error("RATE_LIMITED");
      Object.defineProperty(error, "retryAfterMs", { value: result.retryAfterMs, enumerable: false });
      throw error;
    }
  };
  app.setErrorHandler((error, _request, reply) => {
    const code = error.message;
    const statusCode = code === "AUTH_REQUIRED" || code === "INVALID_TOKEN" || code === "TOKEN_EXPIRED" || code === "IDENTITY_REVOKED" || code === "REFRESH_TOKEN_REVOKED" || code === "REFRESH_PLAYER_MISMATCH" ? 401 : code === "RUN_REVISION_CONFLICT" || code === "COMMAND_NOT_ALLOWED" || code === "IDEMPOTENCY_KEY_REUSED" || code === "ACTIVE_RUN_EXISTS" || code === "INCOMPATIBLE_LEGACY_STATE" || code === "FENCING_TOKEN_STALE" || code === "MATCH_TICKET_EXISTS" ? 409 : code === "RUN_NOT_FOUND" || code === "CONTENT_VERSION_NOT_FOUND" || code === "ROOM_NOT_FOUND" || code === "TICKET_NOT_FOUND" || code === "TICKET_NOT_OWNED" ? 404 : code === "GAME_RULE_VIOLATION" || code === "REWARD_SELECTION_REQUIRED" || code === "REWARD_SELECTION_INVALID" ? 422 : code === "INVALID_COMMAND" || code === "MATCHMAKING_INPUT_REQUIRED" || code === "DEVICE_ID_REQUIRED" || code === "INVALID_REALTIME_ENVELOPE" || code === "ROOM_COMMAND_INPUT_REQUIRED" || code === "ROOM_RECOVERY_INPUT_REQUIRED" ? 400 : code === "RATE_LIMITED" ? 429 : 500;
    const responseCode = statusCode === 500 ? "INTERNAL_ERROR" : code;
    if (code === "RATE_LIMITED") reply.header("retry-after", Math.ceil(((error as Error & { retryAfterMs?: number }).retryAfterMs ?? 1_000) / 1_000));
    return reply.code(statusCode).send(failure(responseCode, code === "RUN_REVISION_CONFLICT" || code === "RATE_LIMITED"));
  });
  app.addHook("onRequest", async (request) => {
    if (onlineRuntime !== undefined && /^\/v1\/(auth|matchmaking|rooms)(?:\/|$)/.test(request.url)) onlineRequestGuard(request);
  });
  app.get("/health", async () => ({ status: "ok" }));
  if (onlineRuntime !== undefined) {
     app.post<{ Body: { device_id: string } }>("/v1/auth/guest", async (request, reply) => { const deviceId = request.body?.device_id; if (typeof deviceId !== "string") throw new Error("DEVICE_ID_REQUIRED"); const identity = onlineRuntime.createGuest(deviceId); return reply.code(201).send(success({ player_id: identity.playerId, access_token: identity.accessToken, refresh_token: identity.refreshToken })); });
     app.post<{ Body: { refresh_token: string } }>("/v1/auth/refresh", async (request) => { const refreshToken = request.body?.refresh_token; if (typeof refreshToken !== "string") throw new Error("INVALID_TOKEN"); const identity = onlineRuntime.rotateRefresh(refreshToken); return success({ player_id: identity.playerId, access_token: identity.accessToken, refresh_token: identity.refreshToken }); });
    app.post("/v1/auth/revoke", async (request, reply) => { const identity = bearer(request, onlineRuntime); onlineRuntime.revoke(identity.playerId); return reply.code(204).send(); });
     app.post<{ Body: { region: string; mode: string } }>("/v1/matchmaking/tickets", async (request, reply) => { const identity = bearer(request, onlineRuntime); const region = request.body?.region; const mode = request.body?.mode; if (typeof region !== "string" || typeof mode !== "string") throw new Error("MATCHMAKING_INPUT_REQUIRED"); const result = onlineRuntime.enqueue(identity.playerId, region, mode); if (result.room === undefined) return reply.code(202).send(success({ ticket_id: result.ticket.ticketId, status: "QUEUED" })); return reply.code(201).send(success({ ticket_id: result.ticket.ticketId, status: "MATCHED", room: publicRoom(result.room) })); });
     app.delete<{ Params: { ticketId: string } }>("/v1/matchmaking/tickets/:ticketId", async (request, reply) => { const identity = bearer(request, onlineRuntime); return reply.code(onlineRuntime.cancel(identity.playerId, request.params.ticketId) ? 204 : 404).send(); });
     app.get<{ Params: { ticketId: string } }>("/v1/matchmaking/tickets/:ticketId", async (request, reply) => { const identity = bearer(request, onlineRuntime); const status = onlineRuntime.ticketStatus(identity.playerId, request.params.ticketId); if (status === undefined) return reply.code(404).send(failure("TICKET_NOT_FOUND")); return success({ ticket_id: status.ticketId, status: status.status, ...(status.room === undefined ? {} : { room: publicRoom(status.room) }) }); });
    app.get<{ Params: { roomId: string } }>("/v1/rooms/:roomId", async (request, reply) => { const identity = bearer(request, onlineRuntime); const room = onlineRuntime.roomForPlayer(request.params.roomId, identity.playerId); if (room === undefined) return reply.code(404).send(failure("ROOM_NOT_FOUND")); return success(publicRoom(room)); });
    app.post<{ Params: { roomId: string }; Body: { fencing_token: number; command_id: string; type: "READY" } }>("/v1/rooms/:roomId/commands", async (request, reply) => { const identity = bearer(request, onlineRuntime); const body = request.body; if (!body || !Number.isSafeInteger(body.fencing_token) || typeof body.command_id !== "string" || !body.command_id.trim() || body.type !== "READY") throw new Error("ROOM_COMMAND_INPUT_REQUIRED"); const result = onlineRuntime.command(request.params.roomId, identity.playerId, { fencingToken: body.fencing_token, commandId: body.command_id, type: body.type }); if (!result.accepted) { if (result.reason === "ROOM_NOT_FOUND") return reply.code(404).send(failure("ROOM_NOT_FOUND")); return reply.code(409).send(failure(result.reason ?? "COMMAND_NOT_ALLOWED")); } return success(result); });
    app.post<{ Params: { roomId: string }; Body: { fencing_token: number } }>("/v1/rooms/:roomId/recover", async (request) => { const identity = bearer(request, onlineRuntime); const fencingToken = request.body?.fencing_token; if (!Number.isSafeInteger(fencingToken)) throw new Error("ROOM_RECOVERY_INPUT_REQUIRED"); return success(publicRoom(onlineRuntime.recover(request.params.roomId, identity.playerId, fencingToken))); });
    app.post<{ Params: { roomId: string }; Body: { type: "PING" | "COMMAND"; sequence: number; sent_at?: number; command_id?: string; payload?: Record<string, unknown> } }>("/v1/rooms/:roomId/realtime", async (request) => { const identity = bearer(request, onlineRuntime); const body = request.body; if (!body || (body.type !== "PING" && body.type !== "COMMAND") || !Number.isSafeInteger(body.sequence)) throw new Error("INVALID_REALTIME_ENVELOPE"); if (body.type === "PING" && !Number.isSafeInteger(body.sent_at)) throw new Error("INVALID_REALTIME_ENVELOPE"); if (body.type === "COMMAND" && (typeof body.command_id !== "string" || !body.command_id.trim() || typeof body.payload !== "object" || body.payload === null || Array.isArray(body.payload))) throw new Error("INVALID_REALTIME_ENVELOPE"); const envelope = body.type === "PING" ? { type: "PING" as const, sequence: body.sequence, sentAt: body.sent_at! } : { type: "COMMAND" as const, sequence: body.sequence, commandId: body.command_id!, payload: body.payload! }; return success(onlineRuntime.realtime(request.params.roomId, identity.playerId, envelope)); });
    app.get<{ Params: { roomId: string } }>("/v1/rooms/:roomId/realtime/snapshot", async (request) => { const identity = bearer(request, onlineRuntime); const room = onlineRuntime.roomForPlayer(request.params.roomId, identity.playerId); if (room === undefined) throw new Error("ROOM_NOT_FOUND"); return success({ room_id: request.params.roomId, room: publicRoom(room), realtime: onlineRuntime.realtimeSnapshot(request.params.roomId, identity.playerId) }); });
    app.post<{ Params: { roomId: string }; Body: { combat_id: string; result_hash: string } }>("/v1/rooms/:roomId/combat-results", async (request, reply) => { const identity = bearer(request, onlineRuntime); const body = request.body; if (!body || typeof body.combat_id !== "string" || typeof body.result_hash !== "string" || !body.combat_id.trim() || !body.result_hash.trim()) throw new Error("INVALID_COMBAT_RESULT"); const result = onlineRuntime.combatResult(request.params.roomId, identity.playerId, { combatId: body.combat_id, resultHash: body.result_hash }); if (result.reason === "ROOM_NOT_FOUND") return reply.code(404).send(failure("ROOM_NOT_FOUND")); if (result.reason === "INVALID_COMBAT_RESULT") throw new Error("INVALID_COMBAT_RESULT"); if (result.reason === "DUPLICATE_COMBAT_RESULT") return success(result); return success(result.accepted ? result : { accepted: false, reason: "DUPLICATE_COMBAT_RESULT" }); });
  }
  app.get<{ Params: { contentVersion: string } }>("/v1/content/:contentVersion/manifest", async (request, reply) => {
    const content = await contentRepository?.getByVersion(request.params.contentVersion);
    if (content === undefined) return reply.code(404).send(failure("CONTENT_VERSION_NOT_FOUND"));
    return success({ content_version: content.version, content_hash: content.contentHash, manifest: content.manifest });
  });
  app.post<{ Body: { id: string; content_version: string } }>("/v1/runs", async (request, reply) => {
    assertCanonicalContentVersion(request.body.content_version);
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
