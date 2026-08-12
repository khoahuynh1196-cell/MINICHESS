import { describe, expect, it } from "vitest";
import { createHttpApp } from "../src/http/app.js";
import { createOnlineRuntime } from "../src/online/runtime.js";

async function onlineApp() {
  const app = createHttpApp({ actorId: "anonymous", tenantId: "online" }, undefined, undefined, undefined, createOnlineRuntime({ tokenSecret: "http-test-secret", clock: () => 1_700_000_000_000 }));
  return app;
}

async function guest(app: Awaited<ReturnType<typeof onlineApp>>, deviceId: string) {
  const response = await app.inject({ method: "POST", url: "/v1/auth/guest", payload: { device_id: deviceId } });
  expect(response.statusCode).toBe(201);
  return response.json().data as { player_id: string; access_token: string; refresh_token: string };
}

describe("online HTTP boundary", () => {
  it("creates, rotates, and revokes a guest identity", async () => {
    const app = await onlineApp();
    const created = await guest(app, "device-http-a");
    expect(created.player_id).toMatch(/^guest_/);
    const rotated = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refresh_token: created.refresh_token } });
    expect(rotated.statusCode).toBe(200);
    expect(rotated.json().data.refresh_token).not.toBe(created.refresh_token);
    const revoked = await app.inject({ method: "POST", url: "/v1/auth/revoke", headers: { authorization: `Bearer ${rotated.json().data.access_token}` } });
    expect(revoked.statusCode).toBe(204);
    const denied = await app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: `Bearer ${rotated.json().data.access_token}` }, payload: { region: "sea", mode: "ranked" } });
    expect(denied.statusCode).toBe(401);
    await app.close();
  });

  it("returns a bounded auth error for malformed bearer and refresh credentials", async () => {
    const app = await onlineApp();
    const bearerResponse = await app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: "Bearer not-a-token" }, payload: { region: "sea", mode: "ranked" } });
    expect(bearerResponse.statusCode).toBe(401);
    expect(bearerResponse.json().error.code).toBe("INVALID_TOKEN");
    const refreshResponse = await app.inject({ method: "POST", url: "/v1/auth/refresh", payload: { refresh_token: "not-a-token" } });
    expect(refreshResponse.statusCode).toBe(401);
    expect(refreshResponse.json().error.code).toBe("INVALID_TOKEN");
    await app.close();
  });

  it("requires auth for matchmaking and returns an eight-seat room when full", async () => {
    const app = await onlineApp();
    const identities = await Promise.all(Array.from({ length: 8 }, (_, index) => guest(app, `device-http-${index}`)));
    const responses = await Promise.all(identities.map((identity) => app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: `Bearer ${identity.access_token}` }, payload: { region: "sea", mode: "ranked" } })));
    expect(responses.slice(0, 7).every((response) => response.statusCode === 202)).toBe(true);
    const match = responses[7]!.json();
    expect(responses[7]!.statusCode).toBe(201);
    expect(match.data.room.max_players).toBe(8);
    expect(match.data.room.players).toHaveLength(8);
    expect(match.data.room.ruleset_version).toBe("production-4x6-0.1.0");
    const roomId = match.data.room.room_id as string;
    const room = await app.inject({ method: "GET", url: `/v1/rooms/${roomId}`, headers: { authorization: `Bearer ${identities[0]!.access_token}` } });
    expect(room.statusCode).toBe(200);
    expect(room.json().data.room_id).toBe(roomId);
    await app.close();
  });

  it("lets every matched ticket poll its authoritative room", async () => {
    const app = await onlineApp();
    const identities = await Promise.all(Array.from({ length: 8 }, (_, index) => guest(app, `device-ticket-${index}`)));
    const responses = await Promise.all(identities.map((identity) => app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: `Bearer ${identity.access_token}` }, payload: { region: "sea", mode: "poll" } })));
    const queuedTicket = responses[0]!.json().data.ticket_id as string;
    const room = responses[7]!.json().data.room;
    expect(responses[0]!.statusCode).toBe(202);
    const status = await app.inject({ method: "GET", url: `/v1/matchmaking/tickets/${queuedTicket}`, headers: { authorization: `Bearer ${identities[0]!.access_token}` } });
    expect(status.statusCode).toBe(200);
    expect(status.json().data).toMatchObject({ ticket_id: queuedTicket, status: "MATCHED", room: { room_id: room.room_id, max_players: 8, ruleset_version: "production-4x6-0.1.0" } });
    const outsider = await guest(app, "ticket-outsider");
    const hidden = await app.inject({ method: "GET", url: `/v1/matchmaking/tickets/${queuedTicket}`, headers: { authorization: `Bearer ${outsider.access_token}` } });
    expect(hidden.statusCode).toBe(404);
    await app.close();
  });

  it("rejects stale room commands and does not leak room membership", async () => {
    const app = await onlineApp();
    const identities = await Promise.all(Array.from({ length: 8 }, (_, index) => guest(app, `device-room-${index}`)));
    let match: any;
    for (const identity of identities) {
      const response = await app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: `Bearer ${identity.access_token}` }, payload: { region: "sea", mode: "casual" } });
      if (response.statusCode === 201) match = response.json().data;
    }
    const command = await app.inject({ method: "POST", url: `/v1/rooms/${match.room.room_id}/commands`, headers: { authorization: `Bearer ${identities[0]!.access_token}` }, payload: { fencing_token: 0, command_id: "stale", type: "READY" } });
    expect(command.statusCode).toBe(409);
    const outsider = await guest(app, "outsider");
    const hidden = await app.inject({ method: "GET", url: `/v1/rooms/${match.room.room_id}`, headers: { authorization: `Bearer ${outsider.access_token}` } });
    expect(hidden.statusCode).toBe(404);
    await app.close();
  });

  it("returns a reconnect snapshot for an authenticated room member", async () => {
    const app = await onlineApp();
    const identities = await Promise.all(Array.from({ length: 8 }, (_, index) => guest(app, `device-reconnect-${index}`)));
    let match: any;
    for (const identity of identities) {
      const response = await app.inject({ method: "POST", url: "/v1/matchmaking/tickets", headers: { authorization: `Bearer ${identity.access_token}` }, payload: { region: "sea", mode: "reconnect" } });
      if (response.statusCode === 201) match = response.json().data;
    }
    const roomId = match.room.room_id as string;
    const ping = await app.inject({ method: "POST", url: `/v1/rooms/${roomId}/realtime`, headers: { authorization: `Bearer ${identities[0]!.access_token}` }, payload: { type: "PING", sequence: 1, sent_at: 1_699_999_999_900 } });
    expect(ping.statusCode).toBe(200);
    const snapshot = await app.inject({ method: "GET", url: `/v1/rooms/${roomId}/realtime/snapshot`, headers: { authorization: `Bearer ${identities[0]!.access_token}` } });
    expect(snapshot.statusCode).toBe(200);
    expect(snapshot.json().data).toMatchObject({ room_id: roomId, room: { ruleset_version: "production-4x6-0.1.0" }, realtime: { playerId: identities[0]!.player_id, lastSequence: 1, serverClockOffsetMs: 100 } });
    await app.close();
  });
});
