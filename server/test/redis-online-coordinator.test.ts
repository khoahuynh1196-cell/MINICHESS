import { describe, expect, it } from "vitest";

describe("Redis online coordinator contract", () => {
  it("acquires an atomic fencing lease and reports its expiry", async () => {
    const { createRedisOnlineCoordinator } = await import("../src/infra/redis-online-coordinator.js");
    const calls: Array<{ script: string; keys: readonly string[]; args: readonly string[] }> = [];
    const client = {
      async eval<T>(script: string, keys: readonly string[], args: readonly string[]): Promise<T> {
        calls.push({ script, keys, args });
        return 7 as T;
      },
      async set(_key: string, _value: string, _options: { readonly PX: number }): Promise<"OK"> { return "OK"; },
    };
    const coordinator = createRedisOnlineCoordinator(client, { keyPrefix: "ab-test", leaseTtlMs: 5_000, now: () => 100_000 });
    await expect(coordinator.acquireLease("room-a", "worker-a")).resolves.toEqual({ roomId: "room-a", ownerId: "worker-a", fencingToken: 7, expiresAtMs: 105_000 });
    expect(calls[0]?.keys).toEqual(["ab-test:room:room-a:lease", "ab-test:room:room-a:fence"]);
    expect(calls[0]?.args).toEqual(["worker-a", "5000"]);
    expect(calls[0]?.script).toContain("INCR");
  });

  it("returns no lease when another owner holds the room and fences renew/release", async () => {
    const { createRedisOnlineCoordinator } = await import("../src/infra/redis-online-coordinator.js");
    const results = [0, 1, 0];
    const calls: string[] = [];
    const client = {
      async eval<T>(script: string): Promise<T> { calls.push(script); return results.shift() as T; },
      async set(_key: string, _value: string, _options: { readonly PX: number }): Promise<"OK"> { return "OK"; },
    };
    const coordinator = createRedisOnlineCoordinator(client, { now: () => 2_000 });
    await expect(coordinator.acquireLease("room-a", "worker-a")).resolves.toBeUndefined();
    await expect(coordinator.renewLease("room-a", "worker-a", 4)).resolves.toBe(true);
    await expect(coordinator.releaseLease("room-a", "worker-a", 4)).resolves.toBe(false);
    expect(calls).toHaveLength(3);
    expect(calls[1]).toContain("PEXPIRE");
    expect(calls[2]).toContain("DEL");
  });

  it("refreshes player presence with a bounded TTL", async () => {
    const { createRedisOnlineCoordinator } = await import("../src/infra/redis-online-coordinator.js");
    const writes: Array<{ key: string; value: string; ttl: number }> = [];
    const client = {
      async eval<T>(): Promise<T> { return 0 as T; },
      async set(key: string, value: string, options: { readonly PX: number }): Promise<"OK"> { writes.push({ key, value, ttl: options.PX }); return "OK"; },
    };
    const coordinator = createRedisOnlineCoordinator(client, { keyPrefix: "ab-test", presenceTtlMs: 12_000 });
    await expect(coordinator.heartbeat("guest-1", "conn-1")).resolves.toBe(true);
    expect(writes).toEqual([{ key: "ab-test:presence:guest-1", value: "conn-1", ttl: 12_000 }]);
  });
});
