import { describe, expect, it } from "vitest";
import { createOnlineRuntime } from "../src/online/runtime.js";

async function roomFor(runtime: ReturnType<typeof createOnlineRuntime>, mode: string) {
  const identities = Array.from({ length: 8 }, (_, index) => runtime.createGuest(`hardening-${mode}-${index}`));
  let match: ReturnType<typeof runtime.enqueue> | undefined;
  for (const identity of identities) {
    const result = runtime.enqueue(identity.playerId, "sea", mode);
    if (result.room !== undefined) match = result;
  }
  if (match?.room === undefined) throw new Error("ROOM_NOT_CREATED");
  return { identities, room: match.room };
}

describe("online production hardening contracts", () => {
  it("isolates realtime sequence state per player and survives reconnect snapshot", async () => {
    const runtime = createOnlineRuntime({ tokenSecret: "hardening-secret", clock: () => 1_700_000_000_000 });
    const { identities, room } = await roomFor(runtime, "realtime-isolation");
    const first = runtime.realtime(room.roomId, identities[0]!.playerId, { type: "PING", sequence: 1, sentAt: 1_699_999_999_900 });
    const second = runtime.realtime(room.roomId, identities[1]!.playerId, { type: "PING", sequence: 1, sentAt: 1_699_999_999_950 });
    expect(first).toMatchObject({ type: "PONG", sequence: 1 });
    expect(second).toMatchObject({ type: "PONG", sequence: 1 });
    expect(runtime.realtimeSnapshot(room.roomId, identities[0]!.playerId)).toMatchObject({ lastSequence: 1, serverClockOffsetMs: 100 });
    expect(runtime.realtimeSnapshot(room.roomId, identities[1]!.playerId)).toMatchObject({ lastSequence: 1, serverClockOffsetMs: 50 });
  });

  it("fences old room writers after recovery and keeps duplicate commands idempotent", async () => {
    const runtime = createOnlineRuntime({ tokenSecret: "hardening-secret", clock: () => 1_700_000_000_000 });
    const { identities, room } = await roomFor(runtime, "lease-chaos");
    expect(runtime.command(room.roomId, identities[0]!.playerId, { fencingToken: 1, commandId: "ready-1", type: "READY" })).toEqual({ accepted: true });
    const recovered = runtime.recover(room.roomId, identities[0]!.playerId, 1);
    expect(recovered.lease.fencingToken).toBe(2);
    expect(runtime.command(room.roomId, identities[1]!.playerId, { fencingToken: 1, commandId: "ready-old", type: "READY" })).toMatchObject({ accepted: false, reason: "FENCING_TOKEN_STALE" });
    expect(runtime.command(room.roomId, identities[0]!.playerId, { fencingToken: 2, commandId: "ready-1", type: "READY" })).toMatchObject({ accepted: false, reason: "DUPLICATE_COMMAND" });
  });

  it("rejects revoked credentials before HTTP can reach queue or room access", async () => {
    const runtime = createOnlineRuntime({ tokenSecret: "hardening-secret" });
    const identity = runtime.createGuest("revoked-device");
    runtime.revoke(identity.playerId);
    expect(() => runtime.verifyAccess(identity.accessToken)).toThrow("IDENTITY_REVOKED");
  });
});
