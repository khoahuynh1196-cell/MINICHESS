import { describe, expect, it } from "vitest";
import { CANONICAL_ASSET_MANIFEST_VERSION, CANONICAL_CONTENT_VERSION, CANONICAL_RULESET_VERSION } from "@auto-battler/game-core";

describe("online PvP contract surface", () => {
  it("exposes guest identity creation with refresh rotation and revocation", async () => {
    const { createIdentityService } = await import("../src/identity/service.js");
    const service = createIdentityService({ clock: () => 1_700_000_000_000, tokenSecret: "test-secret" });
    const created = service.createGuest({ deviceId: "device-a" });

    expect(created.accessToken).toMatch(/^ab_access\./);
    expect(created.refreshToken).toMatch(/^ab_refresh\./);
    expect(service.verifyAccess(created.accessToken)).toMatchObject({ playerId: created.playerId });
    const rotated = service.rotateRefresh(created.refreshToken);
    expect(rotated.refreshToken).not.toBe(created.refreshToken);
    expect(() => service.rotateRefresh(created.refreshToken)).toThrow("REFRESH_TOKEN_REVOKED");
    service.revoke(created.playerId);
    expect(() => service.verifyAccess(rotated.accessToken)).toThrow("IDENTITY_REVOKED");
  });

  it("requires ordered realtime envelopes and suppresses duplicate commands", async () => {
    const { createRealtimeSession } = await import("../src/realtime/session.js");
    const session = createRealtimeSession({ playerId: "player-a", now: () => 1000 });
    expect(session.accept({ type: "PING", sequence: 1, sentAt: 900 })).toMatchObject({ type: "PONG", sequence: 1, serverTime: 1000 });
    expect(session.accept({ type: "COMMAND", sequence: 2, commandId: "cmd-1", payload: { type: "READY" } })).toMatchObject({ accepted: true });
    expect(session.accept({ type: "COMMAND", sequence: 2, commandId: "cmd-1", payload: { type: "READY" } })).toMatchObject({ accepted: false, reason: "DUPLICATE_COMMAND" });
    expect(() => session.accept({ type: "COMMAND", sequence: 1, commandId: "cmd-old", payload: { type: "READY" } })).toThrow("SEQUENCE_OUT_OF_ORDER");
    expect(session.snapshot().serverClockOffsetMs).toBe(100);
  });

  it("fills and cancels an eight-player canonical matchmaking ticket", async () => {
    const { createMatchmakingQueue } = await import("../src/matchmaking/queue.js");
    const queue = createMatchmakingQueue();
    const tickets = Array.from({ length: 8 }, (_, index) => queue.enqueue({ playerId: `p${index}`, region: "sea", mode: "ranked" }));
    const match = queue.tryMatch("sea", "ranked");
    expect(match).toMatchObject({ seats: tickets.map((ticket) => ticket.ticketId), maxPlayers: 8 });
    expect(queue.cancel(tickets[0]!.ticketId)).toBe(false);
    const pending = queue.enqueue({ playerId: "pending", region: "sea", mode: "ranked" });
    expect(queue.cancel(pending.ticketId)).toBe(true);
  });

  it("rejects incomplete matchmaking input before a ticket is created", async () => {
    const { createMatchmakingQueue } = await import("../src/matchmaking/queue.js");
    const queue = createMatchmakingQueue();
    expect(() => queue.enqueue({ playerId: "p0", region: "", mode: "ranked" })).toThrow("MATCHMAKING_INPUT_REQUIRED");
  });

  it("keeps ticket ids unique and rejects duplicate active tickets", async () => {
    const { createMatchmakingQueue } = await import("../src/matchmaking/queue.js");
    const queue = createMatchmakingQueue();
    const first = queue.enqueue({ playerId: "p0", region: "sea", mode: "ranked" });
    expect(() => queue.enqueue({ playerId: "p0", region: "sea", mode: "ranked" })).toThrow("MATCH_TICKET_EXISTS");
    expect(queue.cancel(first.ticketId)).toBe(true);
    const next = queue.enqueue({ playerId: "p0", region: "sea", mode: "ranked" });
    expect(next.ticketId).not.toBe(first.ticketId);
    expect(next.ticketId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("rejects malformed realtime envelopes before advancing the sequence", async () => {
    const { createRealtimeSession } = await import("../src/realtime/session.js");
    const session = createRealtimeSession({ playerId: "player-a", now: () => 1000 });
    expect(() => session.accept({ type: "COMMAND", sequence: 1, commandId: "", payload: {} })).toThrow("INVALID_REALTIME_ENVELOPE");
    expect(session.snapshot().lastSequence).toBe(0);
    expect(() => session.accept({ type: "COMMAND", sequence: 1, commandId: "cmd-1", payload: [] as unknown as Record<string, unknown> })).toThrow("INVALID_REALTIME_ENVELOPE");
    expect(session.accept({ type: "COMMAND", sequence: 1, commandId: "cmd-1", payload: { type: "READY" } })).toMatchObject({ accepted: true });
  });

  it("creates a fenced canonical room and recovers without duplicate combat results", async () => {
    const { createRoomRegistry } = await import("../src/rooms/registry.js");
    const registry = createRoomRegistry({ now: () => 2_000 });
    const room = registry.create({ roomId: "room-a", players: Array.from({ length: 8 }, (_, index) => `p${index}`), region: "sea", mode: "ranked" });
    expect(room).toMatchObject({ roomId: "room-a", phase: "PREPARE", lease: { fencingToken: 1 }, maxPlayers: 8, rulesetVersion: CANONICAL_RULESET_VERSION, contentVersion: CANONICAL_CONTENT_VERSION, assetManifestVersion: CANONICAL_ASSET_MANIFEST_VERSION });
    const command = registry.acceptCommand("room-a", { fencingToken: 1, commandId: "ready-p0", playerId: "p0", type: "READY" });
    expect(command.accepted).toBe(true);
    expect(registry.acceptCommand("room-a", { fencingToken: 0, commandId: "stale", playerId: "p0", type: "READY" })).toMatchObject({ accepted: false, reason: "FENCING_TOKEN_STALE" });
    expect(registry.recordCombatResult("room-a", { combatId: "combat-1", resultHash: "hash-a" })).toBe(true);
    expect(registry.recordCombatResult("room-a", { combatId: "combat-1", resultHash: "hash-a" })).toBe(false);
    expect(registry.recover("room-a", { fencingToken: 1 })).toMatchObject({ lease: { fencingToken: 2 }, phase: "PREPARE" });
  });
});
