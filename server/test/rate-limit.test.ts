import { describe, expect, it } from "vitest";

describe("online rate-limit contract", () => {
  it("allows a bounded burst and returns a retry delay after exhaustion", async () => {
    const { createRateLimiter } = await import("../src/security/rate-limit.js");
    let now = 1_000;
    const limiter = createRateLimiter({ clock: () => now, limit: 2, windowMs: 1_000 });
    expect(limiter.allow("player-a")).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.allow("player-a")).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.allow("player-a")).toMatchObject({ allowed: false, retryAfterMs: 1_000 });
    now += 1_001;
    expect(limiter.allow("player-a")).toMatchObject({ allowed: true, remaining: 1 });
  });

  it("isolates keys and does not grow stale buckets forever", async () => {
    const { createRateLimiter } = await import("../src/security/rate-limit.js");
    let now = 5_000;
    const limiter = createRateLimiter({ clock: () => now, limit: 1, windowMs: 100 });
    expect(limiter.allow("player-a").allowed).toBe(true);
    expect(limiter.allow("player-b").allowed).toBe(true);
    now += 101;
    limiter.prune();
    expect(limiter.size()).toBe(0);
  });
});
