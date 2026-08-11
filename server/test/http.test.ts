import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

describe("HTTP adapter", () => {
  it("serves the public health endpoint", async () => {
    const module = await import("../src/http/app.js").catch(() => undefined) as undefined | { createHttpApp: () => { inject(input: unknown): Promise<{ statusCode: number; json(): unknown }> } };
    expect(module).toBeDefined();
    if (!module) return;
    const response = await module.createHttpApp().inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("creates a public run view without accepting or exposing tenant identity", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" });
    const response = await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-http", content_version: "alpha-0.3.0", tenant_id: "tenant-b" } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { id: "run-http", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, round: 1, level: 3, experience: 0, experienceToNext: 10, boardCap: 3, shopOdds: { tier1: 55, tier2: 35, tier3: 10, tier4: 0, tier5: 0 }, shopLocked: false, bench: [], board: Array(16).fill(null) } });
    expect(response.json()).toMatchObject({
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
      server_time: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
  });

  it("creates a run with the initial shop supplied by the content adapter", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" },
      createInMemoryRunRepository(),
      { initialShop: () => [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] },
    );

    const response = await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-content-shop", content_version: "alpha-0.3.0" } });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ data: { shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] } });
  });

  it("reports a conflict when the tenant already has an active run", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" });
    await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-first", content_version: "alpha-0.3.0" } });
    const response = await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-second", content_version: "alpha-0.3.0" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "ACTIVE_RUN_EXISTS", retryable: false } });
  });

  it("returns a tenant-scoped public run view with gameplay state only", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-read",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      round: 2,
      revision: 3,
      gold: 6,
      commandResponses: { "cmd-internal": { runRevision: 3, status: "APPLIED" } },
      commandRequests: { "cmd-internal": "internal-idempotency-fingerprint" },
      shop: [{ heroId: "H01", cost: 1 }],
      bench: [{ instanceId: "hero-bench", heroId: "H02", cost: 2 }],
      board: [{ instanceId: "hero-board", heroId: "H03", cost: 3 }, ...Array(11).fill(null)],
      items: [{ instanceId: "item-read", itemId: "I01", kind: "normal" }],
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);
    const response = await app.inject({ method: "GET", url: "/v1/runs/run-read" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: {
        id: "run-read",
        contentVersion: "alpha-0.3.0",
        state: "PREPARE",
        round: 2,
        revision: 3,
        gold: 6,
        shop: [{ heroId: "H01", cost: 1 }],
        bench: [{ instanceId: "hero-bench", heroId: "H02", cost: 2 }],
        board: [{ instanceId: "hero-board", heroId: "H03", cost: 3 }, ...Array(15).fill(null)],
        items: [{ instanceId: "item-read", itemId: "I01", kind: "normal" }],
      },
    });
  });

  it("returns RUN_NOT_FOUND without disclosing another tenant's run", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const ownerApp = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);
    const otherTenantApp = createHttpApp({ actorId: "actor-b", tenantId: "tenant-b" }, repository);
    await ownerApp.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-private", content_version: "alpha-0.3.0" } });

    const response = await otherTenantApp.inject({ method: "GET", url: "/v1/runs/run-private" });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "RUN_NOT_FOUND" } });
  });

  it("returns only newer combat replay events for the owning tenant", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-events", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 1, revision: 2, gold: 8, commandResponses: {},
      combatRecord: {
        round: 1, winner: "player", resultHash: "abc123def4567890", finalTick: 3, reason: "elimination",
        events: [
          { sequence: 0, tick: 0, type: "COMBAT_STARTED", payload: {} },
          { sequence: 1, tick: 3, type: "COMBAT_ENDED", payload: { winner: "player" } },
        ],
      },
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({ method: "GET", url: "/v1/runs/run-events/events?after_sequence=0" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { events: [{ sequence: 1, tick: 3, type: "COMBAT_ENDED", payload: { winner: "player" } }] },
    });
  });

  it("returns an authoritative resume view and latest combat event sequence", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-resume", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 2, revision: 5, gold: 11, commandResponses: {},
      combatRecord: {
        round: 1, winner: "player", resultHash: "abc123def4567890", finalTick: 3, reason: "elimination",
        events: [{ sequence: 7, tick: 3, type: "COMBAT_ENDED", payload: { winner: "player" } }],
      },
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({ method: "GET", url: "/v1/runs/run-resume/resume" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { run_view: { id: "run-resume", state: "REWARD", revision: 5 }, latest_event_sequence: 7 },
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("returns the immutable manifest for a supported content version", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const { createHttpApp } = await import("../src/http/app.js");
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" },
      undefined,
      undefined,
      { getByVersion: async (version: string) => version === content.version ? content : undefined },
    );

    const response = await app.inject({ method: "GET", url: "/v1/content/alpha-0.3.0/manifest" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      data: { content_version: "alpha-0.3.0", content_hash: content.contentHash, manifest: { heroCount: 20, normalItemCount: 12, uniqueItemCount: 6 } },
      request_id: expect.stringMatching(/^[0-9a-f-]{36}$/),
    });
  });

  it("preselects a hidden Unique from the immutable content when a run is created", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const repository = createInMemoryRunRepository();
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" }, repository, undefined,
      { getByVersion: async (version: string) => version === content.version ? content : undefined },
    );

    const response = await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-http-unique", content_version: "alpha-0.3.0" } });
    const stored = await repository.get("run-http-unique", "tenant-a");

    expect(response.statusCode).toBe(201);
    expect(response.json()).not.toHaveProperty("data.runSeed");
    expect(response.json()).not.toHaveProperty("data.preselectedUniqueId");
    expect(stored).toMatchObject({ runSeed: expect.stringMatching(/^[0-9a-f]{64}$/), uniqueRevealed: false });
    expect(content.uniqueItems.map((item) => item.id)).toContain(stored?.preselectedUniqueId);
  });

  it("applies a tenant-scoped refresh command", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" });
    await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-command", content_version: "alpha-0.3.0" } });
    const response = await app.inject({ method: "POST", url: "/v1/runs/run-command/commands", payload: { command_id: "cmd-http", expected_run_revision: 0, type: "REFRESH_SHOP" } });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { runRevision: 1, status: "APPLIED" } });
  });

  it("exposes a server-backed shop lock after the lock command", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" });
    await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-shop-lock", content_version: "alpha-0.3.0" } });

    const command = await app.inject({ method: "POST", url: "/v1/runs/run-shop-lock/commands", payload: { command_id: "cmd-lock-shop", expected_run_revision: 0, type: "LOCK_SHOP" } });
    const view = await app.inject({ method: "GET", url: "/v1/runs/run-shop-lock" });

    expect(command.statusCode).toBe(200);
    expect(view.json()).toMatchObject({ data: { revision: 1, shopLocked: true, shopOdds: { tier1: 55, tier2: 35, tier3: 10, tier4: 0, tier5: 0 } } });
  });

  it("accepts a snake-case reward selection without exposing the private run seed", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-http-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 3, revision: 2, gold: 13,
      runSeed: "000102030405060708090a0b0c0d0e0f", commandResponses: {}, combatRecord: { round: 3, winner: "player", resultHash: "httpreward123456", finalTick: 5, reason: "elimination", events: [] },
      roundRewardPlan: {
        round: 3, supplementalGold: 0, freeRefreshes: 0,
        offers: [{ id: "reward:3:normal_item_choice:0", kind: "normal_item_choice", options: [{ id: "I01", kind: "normal_item" }, { id: "I02", kind: "normal_item" }, { id: "I03", kind: "normal_item" }] }],
      },
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const before = await app.inject({ method: "GET", url: "/v1/runs/run-http-reward" });
    const claim = await app.inject({
      method: "POST", url: "/v1/runs/run-http-reward/commands",
      payload: { command_id: "cmd-http-reward", expected_run_revision: 2, type: "CLAIM_ROUND_REWARD", reward_selections: [{ offer_id: "reward:3:normal_item_choice:0", option_id: "I02" }] },
    });

    expect(before.json()).toMatchObject({ data: { roundRewardPlan: { offers: [expect.objectContaining({ kind: "normal_item_choice" })] } } });
    expect(JSON.stringify(before.json())).not.toContain("000102030405060708090a0b0c0d0e0f");
    expect(claim.statusCode).toBe(200);
    await expect(repository.get("run-http-reward", "tenant-a")).resolves.toMatchObject({ state: "PREPARE", items: [expect.objectContaining({ itemId: "I02" })] });
  });

  it("starts a round through HTTP and exposes only resume gameplay state", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const boardHero = { instanceId: "hero-http-start", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-http-start", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8, commandResponses: {}, board: [boardHero, ...Array(11).fill(null)] });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const command = await app.inject({ method: "POST", url: "/v1/runs/run-http-start/commands", payload: { command_id: "cmd-http-start", expected_run_revision: 0, type: "START_ROUND" } });
    const resume = await app.inject({ method: "GET", url: "/v1/runs/run-http-start" });

    expect(command.statusCode).toBe(200);
    expect(command.json()).toMatchObject({ data: { runRevision: 1, status: "APPLIED" } });
    expect(resume.statusCode).toBe(200);
    expect(resume.json()).toMatchObject({ data: { state: "COMBAT", round: 1, board: [boardHero, ...Array(15).fill(null)] } });
    expect(resume.json()).not.toHaveProperty("data.lockedSnapshot");
    expect(resume.json()).not.toHaveProperty("data.commandResponses");
  });

  it("resolves a started round on the server and exposes the resulting reward state", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-http-resolve", tenantId: "tenant-a", contentVersion: content.version, state: "PREPARE", round: 1, revision: 0, gold: 8,
      runSeed: "0".repeat(64), commandResponses: {}, board: [{ instanceId: "hero-http-resolve", heroId: "H01", cost: 1 }, ...Array(11).fill(null)],
    });
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" }, repository, undefined,
      { getByVersion: async (version: string) => version === content.version ? content : undefined },
    );

    const start = await app.inject({ method: "POST", url: "/v1/runs/run-http-resolve/commands", payload: { command_id: "cmd-http-resolve-start", expected_run_revision: 0, type: "START_ROUND" } });
    const resolve = await app.inject({ method: "POST", url: "/v1/runs/run-http-resolve/resolve-combat" });
    const stored = await repository.get("run-http-resolve", "tenant-a");

    expect(start.statusCode).toBe(200);
    expect(resolve.statusCode).toBe(200);
    expect(resolve.json()).toMatchObject({ data: { id: "run-http-resolve", state: "REWARD", revision: 2 } });
    expect(stored).toMatchObject({ state: "REWARD", revision: 2, combatRecord: { round: 1, events: expect.any(Array) }, roundRewardPlan: expect.any(Object) });
  });

  it("completes all eight authoritative rounds through the HTTP lifecycle", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-http-eight", tenantId: "tenant-a", contentVersion: content.version, state: "PREPARE", round: 1, revision: 0, gold: 8, health: 300,
      runSeed: "0".repeat(64), preselectedUniqueId: "U01", uniqueRevealed: false, commandResponses: {},
      board: [
        { instanceId: "hero-http-eight-1", heroId: "H20", cost: 3, stars: 3 },
        { instanceId: "hero-http-eight-2", heroId: "H20", cost: 3, stars: 3 },
        { instanceId: "hero-http-eight-3", heroId: "H20", cost: 3, stars: 3 },
        ...Array(9).fill(null),
      ],
    });
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" }, repository, undefined,
      { getByVersion: async (version: string) => version === content.version ? content : undefined },
    );

    for (const round of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const before = await repository.get("run-http-eight", "tenant-a");
      const start = await app.inject({ method: "POST", url: "/v1/runs/run-http-eight/commands", payload: { command_id: `cmd-eight-start-${round}`, expected_run_revision: before!.revision, type: "START_ROUND" } });
      const resolve = await app.inject({ method: "POST", url: "/v1/runs/run-http-eight/resolve-combat" });
      const resolved = await repository.get("run-http-eight", "tenant-a");
      const selections = (resolved!.roundRewardPlan?.offers ?? []).map((offer) => ({ offer_id: offer.id, option_id: offer.options[0]!.id }));
      const claim = await app.inject({ method: "POST", url: "/v1/runs/run-http-eight/commands", payload: { command_id: `cmd-eight-reward-${round}`, expected_run_revision: resolved!.revision, type: "CLAIM_ROUND_REWARD", reward_selections: selections } });

      expect(start.statusCode).toBe(200);
      expect(resolve.statusCode).toBe(200);
      expect(resolved).toMatchObject({ state: "REWARD", round, combatRecord: { round, events: expect.any(Array) } });
      expect(claim.statusCode).toBe(200);
    }
    const terminalRun = await repository.get("run-http-eight", "tenant-a");
    expect(terminalRun).toMatchObject({ state: "COMPLETE", round: 8, rewardClaimedRound: 8, uniqueRevealed: true });

	const completed = await app.inject({ method: "GET", url: "/v1/runs/run-http-eight" });
	expect(completed.statusCode).toBe(200);
	expect(completed.json()).toMatchObject({
		data: {
			state: "COMPLETE",
			recap: {
				winner: terminalRun!.combatRecord!.winner,
				round: 8,
				mvp: "H20",
				damageByHero: { H20: expect.any(Number) },
				healByHero: expect.any(Object),
				activeTraits: expect.arrayContaining(["R_EXOTIC 1"]),
			},
		},
	});
  });

  it("does not allow another tenant to start a round", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const boardHero = { instanceId: "hero-http-private", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-http-private-start", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, round: 1, revision: 0, gold: 8, commandResponses: {}, board: [boardHero, ...Array(11).fill(null)] };
    await repository.save(initialRun);
    const app = createHttpApp({ actorId: "actor-b", tenantId: "tenant-b" }, repository);

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-http-private-start/commands", payload: { command_id: "cmd-http-private-start", expected_run_revision: 0, type: "START_ROUND" } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "RUN_NOT_FOUND", retryable: false } });
    await expect(repository.get("run-http-private-start", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("moves the requested hero instance using the HTTP snake-case payload", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const hero = { instanceId: "hero-http", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-move-http", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null) });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-move-http/commands", payload: { command_id: "cmd-move-http", expected_run_revision: 0, type: "MOVE_HERO", hero_instance_id: hero.instanceId, destination: 16 } });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { runRevision: 1, status: "APPLIED" } });
    await expect(repository.get("run-move-http", "tenant-a")).resolves.toMatchObject({ bench: [], board: [hero, ...Array(15).fill(null)] });
  });

  it("does not allow a tenant to move a hero in another tenant's run", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const hero = { instanceId: "hero-other-tenant", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-other-tenant", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(12).fill(null) };
    await repository.save(initialRun);
    const app = createHttpApp({ actorId: "actor-b", tenantId: "tenant-b" }, repository);

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-other-tenant/commands", payload: { command_id: "cmd-other-tenant", expected_run_revision: 0, type: "MOVE_HERO", hero_instance_id: hero.instanceId, destination: 12 } });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ error: { code: "RUN_NOT_FOUND", retryable: false } });
    await expect(repository.get("run-other-tenant", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("replaces the shop through the injected content adapter when refreshed", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-refresh-http",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      revision: 0,
      gold: 8,
      commandResponses: {},
      shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }],
    });
    const app = createHttpApp(
      { actorId: "actor-a", tenantId: "tenant-a" },
      repository,
      {
        initialShop: () => [],
        refreshShop: () => [{ heroId: "H05", cost: 2 }, { heroId: "H06", cost: 1 }, { heroId: "H07", cost: 2 }, { heroId: "H08", cost: 2 }],
      },
    );

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-refresh-http/commands", payload: { command_id: "cmd-refresh-http", expected_run_revision: 0, type: "REFRESH_SHOP" } });

    expect(response.statusCode).toBe(200);
    await expect(repository.get("run-refresh-http", "tenant-a")).resolves.toMatchObject({
      gold: 6,
      shopRefreshes: 1,
      shop: [{ heroId: "H05", cost: 2 }, { heroId: "H06", cost: 1 }, { heroId: "H07", cost: 2 }, { heroId: "H08", cost: 2 }],
    });
  });

  it("buys the requested priced shop slot for the authenticated tenant", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-buy-http",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      revision: 0,
      gold: 8,
      commandResponses: {},
      shop: [{ heroId: "H01", cost: 1 }],
      bench: [],
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/runs/run-buy-http/commands",
      payload: { command_id: "cmd-buy-http", expected_run_revision: 0, type: "BUY_SHOP_HERO", shop_slot_index: 0 },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { runRevision: 1, status: "APPLIED" } });
    await expect(repository.get("run-buy-http", "tenant-a")).resolves.toMatchObject({
      gold: 7,
      revision: 1,
      shop: [null],
      bench: [{ heroId: "H01" }],
    });
  });

  it("sells the requested hero instance for the authenticated tenant", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    await repository.save({
      id: "run-sell-http",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      revision: 0,
      gold: 6,
      commandResponses: {},
      bench: [{ instanceId: "hero-run-sell-http-1", heroId: "H02", cost: 2 }],
    });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({
      method: "POST",
      url: "/v1/runs/run-sell-http/commands",
      payload: { command_id: "cmd-sell-http", expected_run_revision: 0, type: "SELL_HERO", hero_instance_id: "hero-run-sell-http-1" },
    });

    expect(response.statusCode).toBe(200);
    await expect(repository.get("run-sell-http", "tenant-a")).resolves.toMatchObject({ gold: 8, revision: 1, bench: [] });
  });

  it("maps an optimistic concurrency conflict to the API error envelope", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" });
    await app.inject({ method: "POST", url: "/v1/runs", payload: { id: "run-conflict", content_version: "alpha-0.3.0" } });
    await app.inject({ method: "POST", url: "/v1/runs/run-conflict/commands", payload: { command_id: "cmd-first", expected_run_revision: 0, type: "REFRESH_SHOP" } });
    const response = await app.inject({ method: "POST", url: "/v1/runs/run-conflict/commands", payload: { command_id: "cmd-stale", expected_run_revision: 0, type: "REFRESH_SHOP" } });
    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({ error: { code: "RUN_REVISION_CONFLICT", retryable: true } });
  });

  it("maps snake-case item equipment payload fields to the command", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const hero = { instanceId: "hero-http-equip", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-http-equip", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(12).fill(null), items: [{ instanceId: "item-http-equip", itemId: "I01", kind: "normal" }] });
    const app = createHttpApp({ actorId: "actor-a", tenantId: "tenant-a" }, repository);

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-http-equip/commands", payload: { command_id: "cmd-http-equip", expected_run_revision: 0, type: "EQUIP_ITEM", item_instance_id: "item-http-equip", hero_instance_id: hero.instanceId } });

    expect(response.statusCode).toBe(200);
    await expect(repository.get("run-http-equip", "tenant-a")).resolves.toMatchObject({ items: [{ instanceId: "item-http-equip", equippedHeroInstanceId: hero.instanceId }] });
  });

  it("does not allow a tenant to equip an item in another tenant's run", async () => {
    const { createHttpApp } = await import("../src/http/app.js");
    const { createInMemoryRunRepository } = await import("../src/application/run-commands.js");
    const repository = createInMemoryRunRepository();
    const hero = { instanceId: "hero-other-equip", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-other-equip", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(12).fill(null), items: [{ instanceId: "item-other-equip", itemId: "I01", kind: "normal" as const }] };
    await repository.save(initialRun);
    const app = createHttpApp({ actorId: "actor-b", tenantId: "tenant-b" }, repository);

    const response = await app.inject({ method: "POST", url: "/v1/runs/run-other-equip/commands", payload: { command_id: "cmd-other-equip", expected_run_revision: 0, type: "EQUIP_ITEM", item_instance_id: "item-other-equip", hero_instance_id: hero.instanceId } });

    expect(response.statusCode).toBe(404);
    await expect(repository.get("run-other-equip", "tenant-a")).resolves.toEqual(initialRun);
  });
});
