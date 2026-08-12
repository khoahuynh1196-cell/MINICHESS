export interface RedisOnlineClient {
  eval<T>(script: string, keys: readonly string[], args: readonly string[]): Promise<T>;
  set(key: string, value: string, options: { readonly PX: number }): Promise<"OK" | null>;
}

export interface RedisOnlineCoordinatorOptions {
  readonly keyPrefix?: string;
  readonly leaseTtlMs?: number;
  readonly presenceTtlMs?: number;
  readonly now?: () => number;
}

export interface RoomLease {
  readonly roomId: string;
  readonly ownerId: string;
  readonly fencingToken: number;
  readonly expiresAtMs: number;
}

const ACQUIRE_LEASE = `
local current = redis.call('GET', KEYS[1])
if current then return 0 end
local fence = redis.call('INCR', KEYS[2])
redis.call('SET', KEYS[1], ARGV[1] .. ':' .. fence, 'PX', ARGV[2])
return fence
`;

const RENEW_LEASE = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] .. ':' .. ARGV[2] then return 0 end
return redis.call('PEXPIRE', KEYS[1], ARGV[3])
`;

const RELEASE_LEASE = `
local current = redis.call('GET', KEYS[1])
if current ~= ARGV[1] .. ':' .. ARGV[2] then return 0 end
return redis.call('DEL', KEYS[1])
`;

function positiveInteger(value: number | undefined, fallback: number): number {
  return Number.isSafeInteger(value) && value! > 0 ? value! : fallback;
}

export function createRedisOnlineCoordinator(client: RedisOnlineClient, options: RedisOnlineCoordinatorOptions = {}) {
  const prefix = options.keyPrefix ?? "auto-battler";
  const leaseTtlMs = positiveInteger(options.leaseTtlMs, 10_000);
  const presenceTtlMs = positiveInteger(options.presenceTtlMs, 30_000);
  const now = options.now ?? Date.now;
  const leaseKey = (roomId: string) => `${prefix}:room:${roomId}:lease`;
  const fenceKey = (roomId: string) => `${prefix}:room:${roomId}:fence`;
  return Object.freeze({
    async acquireLease(roomId: string, ownerId: string): Promise<RoomLease | undefined> {
      if (!roomId.trim() || !ownerId.trim()) throw new Error("LEASE_INPUT_REQUIRED");
      const token = Number(await client.eval<number>(ACQUIRE_LEASE, [leaseKey(roomId), fenceKey(roomId)], [ownerId, String(leaseTtlMs)]));
      if (!Number.isSafeInteger(token) || token <= 0) return undefined;
      return { roomId, ownerId, fencingToken: token, expiresAtMs: now() + leaseTtlMs };
    },
    async renewLease(roomId: string, ownerId: string, fencingToken: number): Promise<boolean> {
      if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) return false;
      const renewed = Number(await client.eval<number>(RENEW_LEASE, [leaseKey(roomId)], [ownerId, String(fencingToken), String(leaseTtlMs)]));
      return renewed === 1;
    },
    async releaseLease(roomId: string, ownerId: string, fencingToken: number): Promise<boolean> {
      if (!Number.isSafeInteger(fencingToken) || fencingToken <= 0) return false;
      const released = Number(await client.eval<number>(RELEASE_LEASE, [leaseKey(roomId)], [ownerId, String(fencingToken)]));
      return released === 1;
    },
    async heartbeat(playerId: string, connectionId: string): Promise<boolean> {
      if (!playerId.trim() || !connectionId.trim()) return false;
      return (await client.set(`${prefix}:presence:${playerId}`, connectionId, { PX: presenceTtlMs })) === "OK";
    },
  });
}
