export interface RateLimiterOptions {
  readonly clock?: () => number;
  readonly limit: number;
  readonly windowMs: number;
}

interface Bucket {
  count: number;
  windowStartedAt: number;
}

export function createRateLimiter(options: RateLimiterOptions) {
  if (!Number.isSafeInteger(options.limit) || options.limit < 1 || !Number.isSafeInteger(options.windowMs) || options.windowMs < 1) throw new Error("INVALID_RATE_LIMIT_CONFIG");
  const now = options.clock ?? Date.now;
  const buckets = new Map<string, Bucket>();
  const reset = (key: string, timestamp: number): Bucket => {
    const bucket = { count: 0, windowStartedAt: timestamp };
    buckets.set(key, bucket);
    return bucket;
  };
  return Object.freeze({
    allow(key: string): { readonly allowed: boolean; readonly remaining: number; readonly retryAfterMs?: number } {
      const timestamp = now();
      const existing = buckets.get(key);
      const bucket = existing === undefined || timestamp - existing.windowStartedAt >= options.windowMs ? reset(key, timestamp) : existing;
      if (bucket.count >= options.limit) return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, options.windowMs - (timestamp - bucket.windowStartedAt)) };
      bucket.count += 1;
      return { allowed: true, remaining: options.limit - bucket.count };
    },
    prune(): void {
      const timestamp = now();
      for (const [key, bucket] of buckets) if (timestamp - bucket.windowStartedAt >= options.windowMs) buckets.delete(key);
    },
    size(): number { return buckets.size; },
  });
}
