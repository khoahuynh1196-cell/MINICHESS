import { describe, expect, it } from "vitest";
import type { SqlOnlinePersistenceClient } from "../src/infra/postgres-online-persistence.js";

describe("Postgres online persistence contract", () => {
  it("atomically rotates a refresh session and rejects a replayed token", async () => {
    const { createPostgresOnlinePersistence } = await import("../src/infra/postgres-online-persistence.js");
    const queries: string[] = [];
    let claimed = true;
    const client: SqlOnlinePersistenceClient = {
      async transaction<T>(work: (tx: typeof client) => Promise<T>): Promise<T> { return work(client); },
      async query(text: string, _values: readonly unknown[]) {
        queries.push(text);
        if (text.startsWith("update public.online_refresh_sessions")) {
          if (!claimed) return { rows: [] };
          claimed = false;
          return { rows: [{ refresh_id: "old-refresh", player_id: "player-a" }] };
        }
        return { rows: [] };
      },
    };
    const persistence = createPostgresOnlinePersistence(client);
    await expect(persistence.rotateRefreshSession({ currentTokenHash: "hash-old", refreshId: "refresh-new", playerId: "player-a", tokenHash: "hash-new", expiresAt: "2030-01-01T00:00:00.000Z" })).resolves.toEqual({ refreshId: "refresh-new", playerId: "player-a" });
    await expect(persistence.rotateRefreshSession({ currentTokenHash: "hash-old", refreshId: "refresh-again", playerId: "player-a", tokenHash: "hash-again", expiresAt: "2030-01-01T00:00:00.000Z" })).resolves.toBeUndefined();
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
