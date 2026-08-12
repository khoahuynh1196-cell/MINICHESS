import { describe, expect, it } from "vitest";
import type { SqlOnlinePersistenceClient } from "../src/infra/postgres-online-persistence.js";

describe("Postgres online persistence contract", () => {
  it("resolves a public guest id to its UUID before creating a durable ticket", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: Array<{ text: string; values: readonly unknown[] }> = [];
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("select player_id from public.online_identities")) return { rows: [{ player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await persistence.createMatchTicket({ ticketId: "6e0f6a9e-8845-4f0d-9c3a-8b3a0a8bd9d5", playerId: "guest_public_1", region: "sea", mode: "ranked" });
    const identityLookup = queries.find((query) => query.text.startsWith("select player_id from public.online_identities"));
    const ticketInsert = queries.find((query) => query.text.startsWith("insert into public.online_match_tickets"));
    expect(identityLookup?.values).toEqual(["guest_public_1"]);
    expect(ticketInsert?.values?.[1]).toBe("2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10");
  });

  it("resolves a public guest id before cancelling a durable ticket", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: Array<{ text: string; values: readonly unknown[] }> = [];
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("select player_id from public.online_identities")) return { rows: [{ player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        if (text.startsWith("update public.online_match_tickets")) return { rows: [{ ticket_id: "6e0f6a9e-8845-4f0d-9c3a-8b3a0a8bd9d5" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.cancelMatchTicket({ ticketId: "6e0f6a9e-8845-4f0d-9c3a-8b3a0a8bd9d5", playerId: "guest_public_1" })).resolves.toBe(true);
    const update = queries.find((query) => query.text.startsWith("update public.online_match_tickets"));
    expect(update?.values?.[1]).toBe("2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10");
  });

  it("resolves a public guest id before rotating a durable refresh session", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: Array<{ text: string; values: readonly unknown[] }> = [];
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("select player_id from public.online_identities")) return { rows: [{ player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        if (text.startsWith("update public.online_refresh_sessions")) return { rows: [{ refresh_id: "old-refresh", player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.rotateRefreshSession({ currentTokenHash: "hash-old", refreshId: "refresh-new", playerId: "guest_public_1", tokenHash: "hash-new", expiresAt: "2030-01-01T00:00:00.000Z" })).resolves.toEqual({ refreshId: "refresh-new", playerId: "guest_public_1" });
    const insert = queries.find((query) => query.text.startsWith("insert into public.online_refresh_sessions"));
    expect(insert?.values?.[1]).toBe("2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10");
  });

  it("resolves a public guest id before accepting a durable room command", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: Array<{ text: string; values: readonly unknown[] }> = [];
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, values: readonly unknown[]) {
        queries.push({ text, values });
        if (text.startsWith("select fencing_token")) return { rows: [{ fencing_token: 1 }] };
        if (text.startsWith("select player_id from public.online_identities")) return { rows: [{ player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        if (text.startsWith("select 1 from public.online_room_seats")) return { rows: [{ one: 1 }] };
        if (text.startsWith("insert into public.online_room_commands")) return { rows: [{ command_id: "ready-1" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.acceptRoomCommand({ roomId: "room-a", playerId: "guest_public_1", commandId: "ready-1", fencingToken: 1, sequence: 1, payload: { type: "READY" } })).resolves.toEqual({ accepted: true });
    const member = queries.find((query) => query.text.startsWith("select 1 from public.online_room_seats"));
    const insert = queries.find((query) => query.text.startsWith("insert into public.online_room_commands"));
    expect(member?.values?.[1]).toBe("2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10");
    expect(insert?.values?.[2]).toBe("2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10");
  });

  it("atomically rotates a refresh session and rejects a replayed token", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: string[] = [];
    let claimed = true;
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, _values: readonly unknown[]) {
        queries.push(text);
        if (text.startsWith("select player_id from public.online_identities")) return { rows: [{ player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        if (text.startsWith("update public.online_refresh_sessions")) {
          if (!claimed) return { rows: [] };
          claimed = false;
          return { rows: [{ refresh_id: "old-refresh", player_id: "2c4e6f8a-8d65-4fb8-9b75-8e6f9c7d4a10" }] };
        }
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.rotateRefreshSession({ currentTokenHash: "hash-old", refreshId: "refresh-new", playerId: "guest_public_1", tokenHash: "hash-new", expiresAt: "2030-01-01T00:00:00.000Z" })).resolves.toEqual({ refreshId: "refresh-new", playerId: "guest_public_1" });
    await expect(persistence.rotateRefreshSession({ currentTokenHash: "hash-old", refreshId: "refresh-again", playerId: "guest_public_1", tokenHash: "hash-again", expiresAt: "2030-01-01T00:00:00.000Z" })).resolves.toBeUndefined();
    expect(queries.filter((text) => text.startsWith("update public.online_refresh_sessions"))).toHaveLength(2);
    expect(queries.some((text) => text.startsWith("insert into public.online_refresh_sessions"))).toBe(true);
  });

  it("claims exactly eight ordered tickets and writes room seats in one transaction", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: string[] = [];
    const tickets = Array.from({ length: 8 }, (_, index) => ({ ticket_id: `ticket-${index}`, player_id: `player-${index}` }));
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, _values: readonly unknown[]) {
        queries.push(text);
        if (text.startsWith("select ticket_id, player_id")) return { rows: tickets };
        if (text.startsWith("select count(*)")) return { rows: [{ count: "0" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.claimEightSeatMatch({ roomId: "room-a", region: "sea", mode: "ranked", rulesetVersion: "production-4x6-0.1.0", contentVersion: "alpha-0.4.0", assetManifestVersion: "asset-4x6-0.1.0" })).resolves.toMatchObject({ roomId: "room-a", playerIds: tickets.map((ticket) => ticket.player_id) });
    expect(queries.some((text) => text.includes("for update skip locked"))).toBe(true);
    expect(queries.some((text) => text.startsWith("insert into public.online_room_seats"))).toBe(true);
    expect(queries.some((text) => text.startsWith("update public.online_match_tickets"))).toBe(true);
  });

  it("returns explicit fencing and membership outcomes for room commands", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    let roomToken = 3;
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, _values: readonly unknown[]) {
        if (text.startsWith("select fencing_token")) return { rows: [{ fencing_token: roomToken }] };
        if (text.startsWith("select 1 from public.online_room_seats")) return { rows: [] };
        if (text.startsWith("update public.online_rooms")) return { rows: [{ fencing_token: roomToken + 1, lease_expires_at: "2030-01-01T00:00:00.000Z" }] };
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.acceptRoomCommand({ roomId: "room-a", playerId: "outsider", commandId: "cmd-a", fencingToken: 2, sequence: 1, payload: { type: "READY" } })).resolves.toEqual({ accepted: false, reason: "FENCING_TOKEN_STALE" });
    await expect(persistence.acceptRoomCommand({ roomId: "room-a", playerId: "outsider", commandId: "cmd-b", fencingToken: 3, sequence: 2, payload: { type: "READY" } })).resolves.toEqual({ accepted: false, reason: "PLAYER_NOT_IN_ROOM" });
    roomToken = 4;
    await expect(persistence.recoverRoom({ roomId: "room-a", fencingToken: 3 })).resolves.toBeDefined();
  });
});
