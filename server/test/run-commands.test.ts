import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { CombatSnapshot } from "@auto-battler/game-core";
import { createRunInput, productionRules, rulesRun, runDependencies } from "./support/production-rules.js";


const modulePath = "../src/application/run-commands.js";

type RunCommandsModule = typeof import("../src/application/run-commands.js");

function createTestRun(module: any, input: any, repository: any, shopGenerator?: any, setup?: any) {
  return module.createRun(createRunInput(input), runDependencies(repository, shopGenerator), setup);
}

function applyTestCommand(module: any, input: any, repository: any, shopGenerator?: any) {
  return module.applyRunCommand(input, runDependencies(repository, shopGenerator));
}

function recordTestCombat(lifecycle: any, run: Record<string, unknown>, result: unknown) {
  return lifecycle.recordResolvedCombat(rulesRun(run), result, productionRules);
}

function claimTestReward(lifecycle: any, run: Record<string, unknown>, selections: readonly unknown[] = []) {
  return lifecycle.claimResolvedRoundReward(rulesRun(run), selections, productionRules);
}


describe("run commands", () => {
	it("toggles a persisted shop lock and refuses refresh while the server lock is active", async () => {
		const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
		const repository = module.createInMemoryRunRepository();
		await createTestRun(module, { id: "run-lock-shop", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository);

		await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-lock-shop", commandId: "cmd-lock", expectedRevision: 0, type: "LOCK_SHOP" as never }, repository))
			.resolves.toEqual({ runRevision: 1, status: "APPLIED" });
		await expect(repository.get("run-lock-shop", "tenant-a")).resolves.toMatchObject({ shopLocked: true, gold: 8, revision: 1 });
		await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-lock-shop", commandId: "cmd-locked-refresh", expectedRevision: 1, type: "REFRESH_SHOP" }, repository))
			.rejects.toThrow("COMMAND_NOT_ALLOWED");
		await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-lock-shop", commandId: "cmd-unlock", expectedRevision: 1, type: "LOCK_SHOP" as never }, repository))
			.resolves.toEqual({ runRevision: 2, status: "APPLIED" });
		await expect(repository.get("run-lock-shop", "tenant-a")).resolves.toMatchObject({ shopLocked: false, gold: 8, revision: 2 });
	});
  it("spends four gold for four experience without advancing before the threshold", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await createTestRun(module, { id: "run-buy-xp", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-buy-xp", commandId: "cmd-buy-xp", expectedRevision: 0, type: "BUY_XP" as never }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(repository.get("run-buy-xp", "tenant-a")).resolves.toMatchObject({
      gold: 4,
      level: 3,
      experience: 4,
      revision: 1,
    });
  });

  it("advances a level and carries excess experience into the next threshold", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-xp-level-up", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8,
      level: 3, experience: 8, commandResponses: {}, bench: [], board: Array(16).fill(null),
    });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-xp-level-up", commandId: "cmd-level-up", expectedRevision: 0, type: "BUY_XP" as never }, repository);

    await expect(repository.get("run-xp-level-up", "tenant-a")).resolves.toMatchObject({ gold: 4, level: 4, experience: 2, revision: 1 });
  });

  it("rejects XP purchases at the level cap without mutating the run", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const initialRun = {
      id: "run-xp-cap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, round: 8, revision: 0, gold: 8,
      level: 10, experience: 0, commandResponses: {}, bench: [], board: Array(16).fill(null),
    };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-xp-cap", commandId: "cmd-xp-cap", expectedRevision: 0, type: "BUY_XP" as never }, repository))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-xp-cap", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("replays an XP command once and rejects a different stale revision", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await createTestRun(module, { id: "run-xp-idempotency", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository);
    const command = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-xp-idempotency", commandId: "cmd-xp-replay", expectedRevision: 0, type: "BUY_XP" as never };

    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(applyTestCommand(module, { ...command, commandId: "cmd-xp-stale" }, repository)).rejects.toThrow("RUN_REVISION_CONFLICT");
    await expect(repository.get("run-xp-idempotency", "tenant-a")).resolves.toMatchObject({ gold: 4, experience: 4, revision: 1 });
  });

  it("enforces the level-derived board cap for placement and round start", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const heroes = Array.from({ length: 5 }, (_, index) => ({ instanceId: `hero-cap-${index + 1}`, heroId: `H0${index + 1}`, cost: 1 }));
    const initialRun = {
      id: "run-level-board-cap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, round: 8, revision: 0, gold: 8,
      level: 4, experience: 0, commandResponses: {}, bench: [heroes[4]!], board: [...heroes.slice(0, 4), ...Array(12).fill(null)],
    };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-level-board-cap", commandId: "cmd-over-cap-move", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: heroes[4]!.instanceId, destination: 20 }, repository))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-level-board-cap", commandId: "cmd-over-cap-start", expectedRevision: 0, type: "START_ROUND" }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
  });

  it("persists a resolved combat record and moves a combat run to reward", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js").catch(() => undefined) as undefined | {
      recordResolvedCombat(run: unknown, result: unknown): { state: string; combatRecord: { winner: string; resultHash: string }; revision: number };
    };
    expect(lifecycle).toBeDefined();
    if (lifecycle === undefined) return;
    const run = { id: "run-result", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "COMBAT", round: 1, revision: 4, gold: 8, commandResponses: {}, lockedSnapshot: { runId: "run-result", contentVersion: "alpha-0.3.0", round: 1, board: Array(16).fill(null) } };
    const result = { events: [{ sequence: 0, tick: 0, type: "COMBAT_ENDED", payload: { winner: "player" } }], finalTick: 1, reason: "elimination", resultHash: "abc123def4567890", units: [], winner: "player" };

    expect(recordTestCombat(lifecycle, run, result)).toMatchObject({
      state: "REWARD",
      revision: 5,
      combatRecord: { winner: "player", resultHash: "abc123def4567890", finalTick: 1 },
    });
  });

  it("deducts capped PvE loss damage from run health using surviving non-summon enemies", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      recordResolvedCombat(run: unknown, result: unknown): { state: string; health: number; revision: number };
    };
    const run = { id: "run-loss", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "COMBAT", round: 1, revision: 2, gold: 8, health: 30, commandResponses: {}, lockedSnapshot: { runId: "run-loss", contentVersion: "alpha-0.3.0", round: 1, board: Array(16).fill(null) } };
    const result = {
      events: [], finalTick: 1, reason: "elimination", resultHash: "abc123def4567890", winner: "enemy",
      units: [
        { id: "enemy:one", side: "enemy", isSummon: false, position: 0, currentHp: 1, mana: 0, attackMeter: 0 },
        { id: "enemy:two", side: "enemy", isSummon: false, position: 1, currentHp: 1, mana: 0, attackMeter: 0 },
        { id: "enemy:summon", side: "enemy", isSummon: true, position: 2, currentHp: 1, mana: 0, attackMeter: 0 },
      ],
    };

    expect(recordTestCombat(lifecycle, run, result)).toMatchObject({ state: "REWARD", health: 22, revision: 3 });
  });

  it("reveals the one preselected Unique into inventory only after a living round-four result", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      recordResolvedCombat(run: unknown, result: unknown): { uniqueRevealed: boolean; items: readonly unknown[] };
    };
    const run = {
      id: "run-unique-reveal", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "COMBAT", round: 4, revision: 5, gold: 18, health: 12,
      runSeed: "000102030405060708090a0b0c0d0e0f", preselectedUniqueId: "U04", uniqueRevealed: false, commandResponses: {},
      lockedSnapshot: { runId: "run-unique-reveal", contentVersion: "alpha-0.3.0", round: 4, board: Array(16).fill(null) },
    };
    const result = { events: [], finalTick: 1, reason: "elimination", resultHash: "uniqueabc1234567", units: [], winner: "player" };

    expect(recordTestCombat(lifecycle, run, result)).toMatchObject({
      state: "REWARD", uniqueRevealed: true,
      items: [{ instanceId: "unique:run-unique-reveal:U04", itemId: "U04", kind: "unique" }],
    });
  });

  it("claims a victorious round's base reward once and advances the run", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js").catch(() => undefined) as undefined | {
      claimResolvedRoundReward(run: unknown): { state: string; round: number; gold: number; revision: number };
    };
    expect(lifecycle).toBeDefined();
    if (lifecycle === undefined) return;
    const run = {
      id: "run-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 1, revision: 3, gold: 8, health: 30, commandResponses: {},
      lockedSnapshot: { runId: "run-reward", contentVersion: "alpha-0.3.0", round: 1, board: Array(16).fill(null) },
      combatRecord: { round: 1, winner: "player", resultHash: "abc123def4567890", finalTick: 1, reason: "elimination", events: [] },
    };

    const claimed = claimTestReward(lifecycle, run);

    expect(claimed).toMatchObject({ state: "PREPARE", round: 2, gold: 13, revision: 4 });
    expect(claimTestReward(lifecycle, claimed)).toEqual(claimed);
  });

  it("awards the mandatory base gold after a surviving loss as well", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      claimResolvedRoundReward(run: unknown): { state: string; round: number; gold: number; revision: number };
    };
    const run = {
      id: "run-loss-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 1, revision: 3, gold: 8, health: 22, commandResponses: {},
      combatRecord: { round: 1, winner: "enemy", resultHash: "lossabc123456789", finalTick: 5, reason: "elimination", events: [] },
    };

    expect(claimTestReward(lifecycle, run)).toMatchObject({ state: "PREPARE", round: 2, gold: 13, revision: 4 });
  });

  it("claims content supplemental gold and a free refresh once alongside the mandatory base award", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      claimResolvedRoundReward(run: unknown): { state: string; round: number; gold: number; freeRefreshes?: number; roundRewardPlan?: unknown; revision: number };
    };
    const run = {
      id: "run-content-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 5, revision: 9, gold: 21, health: 18, commandResponses: {},
      combatRecord: { round: 5, winner: "player", resultHash: "contentreward123", finalTick: 5, reason: "elimination", events: [] },
      roundRewardPlan: { round: 5, supplementalGold: 5, freeRefreshes: 1, offers: [] },
    };

    const claimed = claimTestReward(lifecycle, run);
    expect(claimed).toMatchObject({ state: "PREPARE", round: 6, gold: 31, freeRefreshes: 1, revision: 10 });
    expect(claimed).not.toHaveProperty("roundRewardPlan");
  });

  it("requires and materializes a selected normal-item reward before advancing the round", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      claimResolvedRoundReward(run: unknown, selections?: readonly { offerId: string; optionId: string }[]): { state: string; round: number; gold: number; items?: readonly { itemId: string; kind: string }[] };
    };
    const run = {
      id: "run-item-choice", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 3, revision: 6, gold: 15, health: 21, commandResponses: {},
      combatRecord: { round: 3, winner: "player", resultHash: "itemchoice123456", finalTick: 5, reason: "elimination", events: [] },
      roundRewardPlan: {
        round: 3, supplementalGold: 0, freeRefreshes: 0,
        offers: [{ id: "reward:3:normal_item_choice:0", kind: "normal_item_choice", options: [{ id: "I01", kind: "normal_item" }, { id: "I02", kind: "normal_item" }, { id: "I03", kind: "normal_item" }] }],
      },
    };

    expect(() => claimTestReward(lifecycle, run)).toThrow("REWARD_SELECTION_REQUIRED");
    expect(claimTestReward(lifecycle, run, [{ offerId: "reward:3:normal_item_choice:0", optionId: "I02" }])).toMatchObject({
      state: "PREPARE", round: 4, gold: 20, items: [expect.objectContaining({ itemId: "I02", kind: "normal" })],
    });
  });

  it("completes a victorious eighth round instead of creating a ninth round", async () => {
    const lifecycle = await import("../src/application/round-lifecycle.js") as unknown as {
      claimResolvedRoundReward(run: unknown): { state: string; round: number; gold: number; revision: number };
    };
    const run = {
      id: "run-final-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 8, revision: 10, gold: 41, health: 14, commandResponses: {},
      lockedSnapshot: { runId: "run-final-reward", contentVersion: "alpha-0.3.0", round: 8, board: Array(16).fill(null) },
      combatRecord: { round: 8, winner: "player", resultHash: "finalabc123456789", finalTick: 10, reason: "elimination", events: [] },
    };

    expect(claimTestReward(lifecycle, run)).toMatchObject({ state: "COMPLETE", round: 8, gold: 46, revision: 11 });
  });

  it("accepts an idempotent reward-claim command after a victorious combat", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-command-reward", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 1, revision: 3, gold: 8, health: 30, commandResponses: {},
      combatRecord: { round: 1, winner: "player", resultHash: "rewardabc1234567", finalTick: 5, reason: "elimination", events: [] },
    });
    const command = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-command-reward", commandId: "cmd-claim-reward", expectedRevision: 3, type: "CLAIM_ROUND_REWARD" as never };

    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 4, status: "APPLIED" });
    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 4, status: "APPLIED" });
    await expect(repository.get("run-command-reward", "tenant-a")).resolves.toMatchObject({ state: "PREPARE", round: 2, gold: 13, revision: 4 });
  });

  it("claims a selected reward option through the idempotent run command", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-command-item-choice", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 3, revision: 3, gold: 12, health: 30,
      commandResponses: {}, combatRecord: { round: 3, winner: "player", resultHash: "commandchoice123", finalTick: 5, reason: "elimination", events: [] },
      roundRewardPlan: {
        round: 3, supplementalGold: 0, freeRefreshes: 0,
        offers: [{ id: "reward:3:normal_item_choice:0", kind: "normal_item_choice", options: [{ id: "I01", kind: "normal_item" }, { id: "I02", kind: "normal_item" }, { id: "I03", kind: "normal_item" }] }],
      },
    });
    const command = {
      actorId: "actor-a", tenantId: "tenant-a", runId: "run-command-item-choice", commandId: "cmd-claim-item-choice", expectedRevision: 3,
      type: "CLAIM_ROUND_REWARD" as const, rewardSelections: [{ offerId: "reward:3:normal_item_choice:0", optionId: "I03" }],
    };

    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 4, status: "APPLIED" });
    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 4, status: "APPLIED" });
    await expect(repository.get("run-command-item-choice", "tenant-a")).resolves.toMatchObject({
      state: "PREPARE", gold: 17, items: [expect.objectContaining({ itemId: "I03", kind: "normal" })],
    });
  });

  it("reserves a current hero-choice reward before claim and returns that reservation on sale", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const shopPool = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const pool = shopPool.createShopPool({ heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) } as never, "000102030405060708090a0b0c0d0e0f", productionRules.shop);
    await repository.save({
      id: "run-reward-pool", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 4, revision: 0, gold: 20, commandResponses: {}, shopPool: pool,
      combatRecord: { round: 4, winner: "player", resultHash: "rewardpool123456", finalTick: 1, reason: "elimination", events: [] },
      roundRewardPlan: { round: 4, supplementalGold: 0, freeRefreshes: 0, offers: [{ id: "reward:4:hero_choice:0", kind: "hero_choice", options: [{ id: "H01", kind: "hero", cost: 1 }] }] },
    });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-reward-pool", commandId: "cmd-materialize-hero-reward", expectedRevision: 0, type: "CLAIM_ROUND_REWARD", rewardSelections: [{ offerId: "reward:4:hero_choice:0", optionId: "H01" }] }, repository);
    const materialized = await repository.get("run-reward-pool", "tenant-a");
    expect(materialized?.shopPool?.heroes.H01?.remainingCopies).toBe(28);
    expect(materialized?.rewardHeroes).toMatchObject([{ heroId: "H01", poolCopies: 1 }]);
    const rewardHeroId = materialized?.rewardHeroes?.[0]?.instanceId;
    if (rewardHeroId === undefined) throw new Error("expected materialized reward hero");

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-reward-pool", commandId: "cmd-claim-hero-reward-pool", expectedRevision: 1, type: "CLAIM_REWARD_HERO", heroInstanceId: rewardHeroId }, repository);
    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-reward-pool", commandId: "cmd-sell-hero-reward-pool", expectedRevision: 2, type: "SELL_HERO", heroInstanceId: rewardHeroId }, repository);

    await expect(repository.get("run-reward-pool", "tenant-a")).resolves.toMatchObject({ shopPool: { heroes: { H01: { remainingCopies: 29 } } }, bench: [] });
  });

  it("moves a claimed hero reward into an available bench slot and runs star merge", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const rewardHero = { instanceId: "reward:run-hero-choice:6:reward:6:hero_choice:0:H02", heroId: "H02", cost: 2, stars: 1 as const };
    const firstCopy = { instanceId: "hero-copy-a", heroId: "H02", cost: 2, stars: 1 as const };
    const secondCopy = { instanceId: "hero-copy-b", heroId: "H02", cost: 2, stars: 1 as const };
    await repository.save({
      id: "run-hero-choice", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 6, revision: 4, gold: 28,
      commandResponses: {}, bench: [firstCopy, secondCopy], board: Array(16).fill(null), rewardHeroes: [rewardHero],
    });

    await expect(applyTestCommand(module, {
      actorId: "actor-a", tenantId: "tenant-a", runId: "run-hero-choice", commandId: "cmd-claim-hero-reward", expectedRevision: 4,
      type: "CLAIM_REWARD_HERO" as never, heroInstanceId: rewardHero.instanceId,
    }, repository)).resolves.toEqual({ runRevision: 5, status: "APPLIED" });
    await expect(repository.get("run-hero-choice", "tenant-a")).resolves.toMatchObject({
      rewardHeroes: [], bench: [expect.objectContaining({ heroId: "H02", stars: 2 })],
    });
  });

  it("migrates a legacy reward hero to a zero-reservation merge and sale", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const shopPool = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const pool = shopPool.createShopPool({ heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) } as never, "000102030405060708090a0b0c0d0e0f", productionRules.shop);
    pool.heroes.H01!.remainingCopies = 27;
    const legacyReward = { instanceId: "reward:legacy-run:4:reward:4:hero_choice:0:H01", heroId: "H01", cost: 1, stars: 1 as const };
    await repository.save({
      id: "legacy-run", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 4, revision: 0, gold: 10, commandResponses: {}, shopPool: pool,
      bench: [
        { instanceId: "hero-legacy-shop-a", heroId: "H01", cost: 1, stars: 1 as const, poolCopies: 1 },
        { instanceId: "hero-legacy-shop-b", heroId: "H01", cost: 1, stars: 1 as const, poolCopies: 1 },
      ],
      rewardHeroes: [legacyReward],
    });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "legacy-run", commandId: "cmd-claim-legacy-reward", expectedRevision: 0, type: "CLAIM_REWARD_HERO", heroInstanceId: legacyReward.instanceId }, repository);
    const claimed = await repository.get("legacy-run", "tenant-a");
    const mergedHero = claimed?.bench?.[0];
    expect(mergedHero).toMatchObject({ heroId: "H01", stars: 2, poolCopies: 2 });
    if (mergedHero === undefined) throw new Error("expected merged legacy reward hero");

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "legacy-run", commandId: "cmd-sell-legacy-reward", expectedRevision: 1, type: "SELL_HERO", heroInstanceId: mergedHero.instanceId }, repository)).resolves.toEqual({ runRevision: 2, status: "APPLIED" });
    await expect(repository.get("legacy-run", "tenant-a")).resolves.toMatchObject({ bench: [], shopPool: { heroes: { H01: { remainingCopies: 29 } } } });
  });

  it("sells a directly claimed legacy reward without returning a zero reservation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const shopPool = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const pool = shopPool.createShopPool({ heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) } as never, "000102030405060708090a0b0c0d0e0f", productionRules.shop);
    const legacyReward = { instanceId: "reward:legacy-direct:4:reward:4:hero_choice:0:H01", heroId: "H01", cost: 1, stars: 1 as const };
    await repository.save({
      id: "legacy-direct", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 4, revision: 0, gold: 10, commandResponses: {}, shopPool: pool,
      bench: [], rewardHeroes: [legacyReward],
    });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "legacy-direct", commandId: "cmd-claim-legacy-direct", expectedRevision: 0, type: "CLAIM_REWARD_HERO", heroInstanceId: legacyReward.instanceId }, repository);
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "legacy-direct", commandId: "cmd-sell-legacy-direct", expectedRevision: 1, type: "SELL_HERO", heroInstanceId: legacyReward.instanceId }, repository)).resolves.toEqual({ runRevision: 2, status: "APPLIED" });
    await expect(repository.get("legacy-direct", "tenant-a")).resolves.toMatchObject({ bench: [], shopPool: { heroes: { H01: { remainingCopies: 29 } } } });
  });

  it("acknowledges a revealed Unique without changing reward or inventory", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-ack-unique", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 4, revision: 6, gold: 23, health: 16,
      runSeed: "000102030405060708090a0b0c0d0e0f", preselectedUniqueId: "U04", uniqueRevealed: true, commandResponses: {},
      items: [{ instanceId: "unique:run-ack-unique:U04", itemId: "U04", kind: "unique" }],
      combatRecord: { round: 4, winner: "player", resultHash: "ackabc1234567890", finalTick: 5, reason: "elimination", events: [] },
    });
    const command = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-ack-unique", commandId: "cmd-ack-unique", expectedRevision: 6, type: "ACK_UNIQUE_REVEAL" as never, revealId: "unique:run-ack-unique:U04" };

    await expect(applyTestCommand(module, command, repository)).resolves.toEqual({ runRevision: 7, status: "APPLIED" });
    await expect(repository.get("run-ack-unique", "tenant-a")).resolves.toMatchObject({ state: "REWARD", gold: 23, revision: 7, uniqueRevealAcknowledged: true, items: [{ instanceId: "unique:run-ack-unique:U04", itemId: "U04", kind: "unique" }] });
  });

  it("persists one hidden Unique selected from the run seed at creation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const run = await createTestRun(
      module,
      { id: "run-seeded-unique", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" },
      repository,
      undefined,
      { runSeed: "000102030405060708090a0b0c0d0e0f", uniqueItemIds: ["U06", "U04", "U02", "U05", "U03", "U01"] },
    );

    expect(run).toMatchObject({ runSeed: "000102030405060708090a0b0c0d0e0f", preselectedUniqueId: "U01", uniqueRevealed: false });
  });
  it("builds a deterministic CombatSnapshot from locked player formation and round-one encounter content", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js").catch(() => undefined) as undefined | {
      buildCombatSnapshot(input: unknown): { units: Array<{ id: string; side: string; position: number; maxHp: number; attackDamage: number }> };
    };
    expect(adapter).toBeDefined();
    if (adapter === undefined) return;
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const board = [{ instanceId: "hero-player", heroId: "H01", cost: 1 }, ...Array(15).fill(null)] as const;

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: { runId: "run-combat", contentVersion: "alpha-0.3.0", round: 1, board },
      combatId: "run-combat:1",
      combatSeed: "seed-a",
      rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.map((unit) => ({ id: unit.id, side: unit.side, position: unit.position }))).toEqual([
      { id: "player:hero-player", side: "player", position: 16 },
      { id: "enemy:PVE_01:0", side: "enemy", position: 3 },
      { id: "enemy:PVE_01:1", side: "enemy", position: 5 },
    ]);
    expect(snapshot.units[0]).toMatchObject({ maxHp: 90000, attackDamage: 5000 });
    expect(snapshot.units[1]).toMatchObject({ maxHp: 49500, attackDamage: 2750 });
  });

  it("applies the data-defined star multipliers to a locked player unit", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): { units: readonly { id: string; maxHp: number; attackDamage: number }[] };
    };
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: { runId: "run-star-combat", contentVersion: "alpha-0.3.0", round: 1, board: [{ instanceId: "hero-two-star", heroId: "H01", cost: 1, stars: 2 }, ...Array(15).fill(null)] },
      combatId: "combat:run-star-combat:1", combatSeed: "seed-star", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:hero-two-star")).toMatchObject({ maxHp: 144000, attackDamage: 7500 });
  });

  it("applies equipped data-defined item stat modifiers from the locked snapshot", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): { units: readonly { id: string; attackDamage: number; armor: number }[] };
    };
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-item-combat", contentVersion: "alpha-0.3.0", round: 1,
        board: [{ instanceId: "hero-item", heroId: "H01", cost: 1 }, ...Array(15).fill(null)],
        items: [
          { instanceId: "item-blade", itemId: "I01", kind: "normal", equippedHeroInstanceId: "hero-item" },
          { instanceId: "item-plate", itemId: "I05", kind: "normal", equippedHeroInstanceId: "hero-item" },
        ],
      },
      combatId: "combat:run-item-combat:1", combatSeed: "seed-item", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:hero-item")).toMatchObject({ attackDamage: 5500, armor: 40000 });
  });

  it("attaches an equipped item's canonical combat passives only to its locked holder", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): { units: readonly unknown[] };
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-item-passive", contentVersion: "alpha-0.3.0", round: 1,
        board: [{ instanceId: "hero-passive", heroId: "H01", cost: 1 }, ...Array(15).fill(null)],
        items: [{ instanceId: "item-dawn", itemId: "I10", kind: "normal", equippedHeroInstanceId: "hero-passive" }],
      },
      combatId: "combat:run-item-passive:1", combatSeed: "seed-item-passive", rulesetVersion: "alpha-rules-0.3.0",
    });
    const holder = snapshot.units.find((unit) => (unit as { id: string }).id === "player:hero-passive") as { passives?: readonly unknown[] };
    const enemy = snapshot.units.find((unit) => (unit as { side: string }).side === "enemy") as { passives?: readonly unknown[] };

    expect(holder.passives).toMatchObject([{ ownerId: "I10", triggerId: "I10:trigger:0", trigger: "on_combat_start" }]);
    expect(enemy.passives).toEqual([]);
  });

  it("executes every Alpha I09-I12 and U01-U06 trigger from the compiled bundle", async () => {
    const { compileContentBundle, runHeadlessCombat } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));

    const runItem = (itemId: string, options: {
      readonly maxTicks?: number;
      readonly playerAttackSpeed?: number;
      readonly playerStartingMana?: number;
      readonly enemyAttackSpeed?: number;
      readonly enemyAttackDamage?: number;
    } = {}) => {
      const holderId = `hero-${itemId.toLowerCase()}`;
      const built = adapter.buildCombatSnapshot({
        content,
        ruleset: productionRules,
        lockedSnapshot: {
          runId: `run-${itemId.toLowerCase()}`,
          contentVersion: "alpha-0.3.0",
          round: 1,
          board: [{ instanceId: holderId, heroId: "H16", cost: 3 }, ...Array(15).fill(null)],
          items: [{ instanceId: `item-${itemId.toLowerCase()}`, itemId, kind: itemId.startsWith("U") ? "unique" as const : "normal" as const, equippedHeroInstanceId: holderId }],
        },
        combatId: `combat-${itemId.toLowerCase()}`,
        combatSeed: `seed-${itemId.toLowerCase()}`,
        rulesetVersion: "alpha-rules-0.3.0",
      });
      let enemyIndex = 0;
      return runHeadlessCombat({
        ...built,
        maxTicks: options.maxTicks ?? 1,
        units: built.units.map((unit) => {
          if (unit.side === "player") {
            return {
              ...unit,
              position: 16,
              attackSpeed: options.playerAttackSpeed ?? 0,
              startingMana: options.playerStartingMana ?? 0,
            };
          }
          const index = enemyIndex++;
          return {
            ...unit,
            position: 12 + index,
            attackSpeed: index === 0 ? options.enemyAttackSpeed ?? 0 : 0,
            attackDamage: index === 0 ? options.enemyAttackDamage ?? unit.attackDamage : unit.attackDamage,
          };
        }),
      });
    };

    // Each assertion catches a missing content-to-passive mapping or a no-op generic executor.
    expect(runItem("I09", { playerAttackSpeed: 20_000, enemyAttackSpeed: 20_000 }).events)
      .toContainEqual(expect.objectContaining({ type: "HEAL_APPLIED", sourceUnitId: "player:hero-i09", payload: expect.objectContaining({ amount: expect.any(Number) }) }));
    expect(runItem("I10").events)
      .toContainEqual(expect.objectContaining({ type: "SHIELD_APPLIED", sourceUnitId: "player:hero-i10", payload: expect.objectContaining({ amount: 12_000 }) }));
    expect(runItem("I11", { maxTicks: 11, playerStartingMana: 100_000 }).events)
      .toContainEqual(expect.objectContaining({ type: "EFFECT_APPLIED", sourceUnitId: "player:hero-i11", payload: { effectId: "E_I11", primitive: "deal_damage" } }));
    expect(runItem("I12", { maxTicks: 2, playerAttackSpeed: 20_000 }).events.filter((event) => event.type === "SLOW_APPLIED"))
      .toHaveLength(1);
    expect(runItem("U01", { enemyAttackSpeed: 20_000, enemyAttackDamage: 80_000 }).events.filter((event) => event.type === "STUN_APPLIED"))
      .toHaveLength(1);
    expect(runItem("U02", { maxTicks: 3, playerAttackSpeed: 20_000 }).events.filter((event) => event.type === "EFFECT_APPLIED" && event.payload.effectId === "E_U02"))
      .toHaveLength(1);
    expect(runItem("U03").events)
      .toContainEqual(expect.objectContaining({ type: "SHIELD_APPLIED", sourceUnitId: "player:hero-u03", payload: expect.objectContaining({ amount: 12_000 }) }));
    expect(runItem("U04", { maxTicks: 11, playerStartingMana: 100_000 }).events)
      .toContainEqual(expect.objectContaining({ type: "HEAL_APPLIED", sourceUnitId: "player:hero-u04", payload: expect.objectContaining({ amount: 12_000 }) }));
    expect(runItem("U05", { maxTicks: 11, playerStartingMana: 100_000 }).events.filter((event) => event.type === "UNIT_SUMMONED"))
      .toHaveLength(1);
    expect(runItem("U06", { enemyAttackSpeed: 20_000, enemyAttackDamage: 100_000 }).events)
      .toContainEqual(expect.objectContaining({ type: "SHIELD_APPLIED", sourceUnitId: "player:hero-u06", payload: expect.objectContaining({ amount: 15_000 }) }));
  });

  it("applies the round-five enemy attack-speed affix as a fixed-point bonus", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): { units: readonly { id: string; attackSpeed: number; critChance: number }[] };
    };
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: { runId: "run-affix", contentVersion: "alpha-0.3.0", round: 5, board: [{ instanceId: "hero-player", heroId: "H01", cost: 1 }, ...Array(15).fill(null)] },
      combatId: "combat:run-affix:5", combatSeed: "seed-affix", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "enemy:PVE_05:0")).toMatchObject({ attackSpeed: 1242 });
  });

  it("applies the highest unlocked trait breakpoint to board holders only", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): { units: readonly { id: string; attackSpeed: number }[] };
    };
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-traits", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "cat-guardian", heroId: "H01", cost: 1 },
          { instanceId: "cat-ranger", heroId: "H03", cost: 1 },
          ...Array(14).fill(null),
        ],
      },
      combatId: "combat:run-traits:1", combatSeed: "seed-traits", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:cat-guardian")).toMatchObject({ attackSpeed: 1000, critChance: 100 });
    expect(snapshot.units.find((unit) => unit.id === "player:cat-ranger")).toMatchObject({ attackSpeed: 1100, critChance: 100 });
  });

  it("attaches the active Cow low-health trait trigger to counted board holders", async () => {
    const { compileContentBundle, runHeadlessCombat } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-cow-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "cow-a", heroId: "H15", cost: 1 },
          { instanceId: "cow-b", heroId: "H16", cost: 3 },
          { instanceId: "cow-c", heroId: "H17", cost: 2 },
          ...Array(13).fill(null),
        ],
      },
      combatId: "combat-cow-trigger", combatSeed: "seed-cow-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });
    const holder = snapshot.units.find((unit) => unit.id === "player:cow-a");

    expect(holder).toMatchObject({
      maxHp: 112_000,
      immunities: ["knockback"],
      passives: [expect.objectContaining({ ownerId: "R_COW", trigger: "on_hp_below", thresholdPercent: 500, oncePerCombat: true })],
    });

    let enemyIndex = 0;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: snapshot.units.map((unit, index) => {
        if (unit.side === "player") return { ...unit, position: unit.id === "player:cow-a" ? 16 : 16 + index, attackSpeed: 0 };
        const currentEnemyIndex = enemyIndex++;
        return {
          ...unit,
          position: 12 + currentEnemyIndex,
          attackSpeed: currentEnemyIndex === 0 ? 20_000 : 0,
          attackDamage: currentEnemyIndex === 0 ? 80_000 : unit.attackDamage,
        };
      }),
    });

    expect(result.events).toContainEqual(expect.objectContaining({
      type: "SHIELD_APPLIED", sourceUnitId: "player:cow-a", payload: expect.objectContaining({ amount: 16_800 }),
    }));
  });

  it("executes the active Cat first-critical trait buff from the locked breakpoint", async () => {
    const { compileContentBundle, runHeadlessCombat } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-cat-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "cat-a", heroId: "H01", cost: 1 },
          { instanceId: "cat-b", heroId: "H02", cost: 2 },
          { instanceId: "cat-c", heroId: "H03", cost: 1 },
          { instanceId: "cat-d", heroId: "H04", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-cat-trigger", combatSeed: "seed-cat-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:cat-a")).toMatchObject({
      passives: [expect.objectContaining({ ownerId: "R_CAT", trigger: "on_critical_basic_attack", oncePerCombat: true })],
    });
    let enemyIndex = 0;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 1,
      units: snapshot.units.map((unit, index) => {
        if (unit.side === "player") return {
          ...unit,
          position: unit.id === "player:cat-a" ? 4 : 12 + index,
          attackSpeed: unit.id === "player:cat-a" ? 20_000 : 0,
          critChance: unit.id === "player:cat-a" ? 1_000 : 0,
        };
        const currentEnemyIndex = enemyIndex++;
        return { ...unit, position: currentEnemyIndex === 0 ? 1 : currentEnemyIndex + 1, attackSpeed: 0 };
      }),
    });

    expect(result.events.filter((event) => event.type === "STAT_MODIFIER_APPLIED" && event.sourceUnitId === "player:cat-a"))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ payload: { stat: "move_speed", value: 200 } }),
        expect.objectContaining({ payload: { stat: "attack_speed", value: 150 } }),
      ]));
  });

  it("attaches Rabbit's counted mana, post-cast speed and engaged retreat from the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-rabbit-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "rabbit-a", heroId: "H11", cost: 1 },
          { instanceId: "rabbit-b", heroId: "H12", cost: 1 },
          { instanceId: "rabbit-c", heroId: "H13", cost: 3 },
          { instanceId: "rabbit-d", heroId: "H14", cost: 2 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-rabbit-trigger", combatSeed: "seed-rabbit-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:rabbit-a")).toMatchObject({
      startingMana: 10_000,
      passives: [expect.objectContaining({
        ownerId: "R_RABBIT", trigger: "on_cast_resolve", effects: expect.arrayContaining([
          expect.objectContaining({ primitive: "buff_stat", stat: "attack_speed", baseValue: 250 }),
          expect.objectContaining({ primitive: "retreat", onlyWhenEngaged: true }),
        ]),
      })],
    });
  });

  it("attaches Guardian's combat-start shields to holders and the ally directly behind them", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-guardian-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "guardian-cat", heroId: "H01", cost: 1 },
          { instanceId: "guardian-dog", heroId: "H06", cost: 1 },
          { instanceId: "guardian-cow", heroId: "H15", cost: 1 },
          { instanceId: "guardian-exotic", heroId: "H20", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-guardian-trigger", combatSeed: "seed-guardian-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:guardian-cat")).toMatchObject({
      passives: [expect.objectContaining({
        ownerId: "C_GUARDIAN", trigger: "on_combat_start", effects: expect.arrayContaining([
          expect.objectContaining({ primitive: "shield", target: "self", baseValue: 100, scalesWithMaxHp: true }),
          expect.objectContaining({ primitive: "shield", target: "rear_ally", baseValue: 100, scalesWithMaxHp: true }),
        ]),
      })],
    });
  });

  it("attaches Dog's first low-health ally-speed response at the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-dog-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "dog-a", heroId: "H06", cost: 1 }, { instanceId: "dog-b", heroId: "H07", cost: 2 },
          { instanceId: "dog-c", heroId: "H08", cost: 2 }, { instanceId: "dog-d", heroId: "H09", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-dog-trigger", combatSeed: "seed-dog-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:dog-a")).toMatchObject({
      passives: expect.arrayContaining([expect.objectContaining({
        ownerId: "R_DOG", trigger: "on_hp_below", thresholdPercent: 500, oncePerCombat: true,
        effects: [expect.objectContaining({ primitive: "buff_stat", target: "nearest_trait_ally", stat: "attack_speed", baseValue: 150, durationTicks: 80 })],
      })]),
    });
  });

  it("attaches Dog's adjacent-holder damage reduction with the eight-percent cap", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-dog-adjacent-reduction", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "dog-a", heroId: "H06", cost: 1 }, { instanceId: "dog-b", heroId: "H07", cost: 2 },
          { instanceId: "dog-c", heroId: "H08", cost: 2 }, { instanceId: "dog-d", heroId: "H09", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-dog-adjacent-reduction", combatSeed: "seed-dog-adjacent-reduction", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:dog-a")).toMatchObject({
      passives: expect.arrayContaining([expect.objectContaining({
        ownerId: "R_DOG", trigger: "on_combat_start",
        effects: [expect.objectContaining({
          primitive: "damage_reduction", target: "adjacent_trait_allies", baseValue: 40, durationTicks: 3_600, maxStacks: 2,
        })],
      })]),
    });
  });

  it("attaches Dog's one-time survivor heal at the five-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-dog-five-death-heal", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "dog-a", heroId: "H06", cost: 1 }, { instanceId: "dog-b", heroId: "H07", cost: 2 },
          { instanceId: "dog-c", heroId: "H08", cost: 2 }, { instanceId: "dog-d", heroId: "H09", cost: 3 },
          { instanceId: "dog-e", heroId: "H10", cost: 2 }, ...Array(7).fill(null),
        ],
      },
      combatId: "combat-dog-five-death-heal", combatSeed: "seed-dog-five-death-heal", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:dog-a")).toMatchObject({
      passives: expect.arrayContaining([expect.objectContaining({
        ownerId: "R_DOG", trigger: "on_death", oncePerOwnerPerCombat: true,
        effects: [expect.objectContaining({ primitive: "heal", target: "all_trait_allies", baseValue: 100, scalesWithTargetMaxHp: true })],
      })]),
    });
  });

  it("attaches Mage's opening mana and first-cast mana return at the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-mage-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "mage-cat", heroId: "H04", cost: 3 }, { instanceId: "mage-dog", heroId: "H09", cost: 3 },
          { instanceId: "mage-rabbit", heroId: "H13", cost: 3 }, { instanceId: "mage-exotic", heroId: "H19", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-mage-trigger", combatSeed: "seed-mage-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:mage-cat")).toMatchObject({
      startingMana: 10_000,
      passives: [expect.objectContaining({
        ownerId: "C_MAGE", trigger: "on_cast_resolve", oncePerCombat: true,
        effects: [expect.objectContaining({ primitive: "restore_mana", target: "self", baseValue: 20_000 })],
      })],
    });
  });

  it("attaches Cat's five-unit first-crit damage and mana response", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-cat-five", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "cat-a", heroId: "H01", cost: 1 }, { instanceId: "cat-b", heroId: "H02", cost: 2 },
          { instanceId: "cat-c", heroId: "H03", cost: 1 }, { instanceId: "cat-d", heroId: "H04", cost: 3 },
          { instanceId: "cat-e", heroId: "H05", cost: 2 }, ...Array(7).fill(null),
        ],
      },
      combatId: "combat-cat-five", combatSeed: "seed-cat-five", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:cat-a")).toMatchObject({
      critChance: 100,
      passives: expect.arrayContaining([expect.objectContaining({
        ownerId: "R_CAT", trigger: "on_critical_basic_attack", oncePerCombat: true,
        effects: expect.arrayContaining([
          expect.objectContaining({ primitive: "deal_damage", target: "locked_target", baseValue: 250, scalesWithAttackDamage: true }),
          expect.objectContaining({ primitive: "restore_mana", target: "self", baseValue: 10_000 }),
        ]),
      })]),
    });
  });

  it("attaches Support's recipient protection after heals and shields at the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: { runId: "run-support-trigger", contentVersion: "alpha-0.3.0", round: 1, board: [
        { instanceId: "support-cat", heroId: "H05", cost: 2 }, { instanceId: "support-dog", heroId: "H10", cost: 2 },
        { instanceId: "support-rabbit", heroId: "H14", cost: 2 }, { instanceId: "support-cow", heroId: "H17", cost: 2 }, ...Array(12).fill(null),
      ] },
      combatId: "combat-support-trigger", combatSeed: "seed-support-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:support-cat")).toMatchObject({
      healShieldPower: 150,
      passives: [expect.objectContaining({ ownerId: "C_SUPPORT", trigger: "on_heal_or_shield", effects: [expect.objectContaining({ primitive: "damage_reduction", target: "locked_target", baseValue: 100, durationTicks: 60, maxStacks: 1 })] })],
    });
  });

  it("executes the active Fighter third-hit trait bonus from the locked breakpoint", async () => {
    const { compileContentBundle, runHeadlessCombat } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as {
      buildCombatSnapshot(input: unknown): CombatSnapshot;
    };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-fighter-trigger", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "fighter-a", heroId: "H02", cost: 2 },
          { instanceId: "fighter-b", heroId: "H07", cost: 2 },
          ...Array(14).fill(null),
        ],
      },
      combatId: "combat-fighter-trigger", combatSeed: "seed-fighter-trigger", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:fighter-a")).toMatchObject({
      passives: [expect.objectContaining({ ownerId: "C_FIGHTER", trigger: "on_every_nth_basic_attack", attackCount: 3 })],
    });
    let enemyIndex = 0;
    const result = runHeadlessCombat({
      ...snapshot,
      maxTicks: 3,
      units: snapshot.units.map((unit, index) => {
        if (unit.side === "player") return {
          ...unit,
          position: unit.id === "player:fighter-a" ? 4 : 12 + index,
          attackSpeed: unit.id === "player:fighter-a" ? 20_000 : 0,
        };
        const currentEnemyIndex = enemyIndex++;
        return { ...unit, position: currentEnemyIndex === 0 ? 1 : currentEnemyIndex + 1, attackSpeed: 0 };
      }),
    });

    expect(result.events.filter((event) => event.type === "EFFECT_APPLIED" && event.payload.effectId === "E_C_FIGHTER_2_THIRD_HIT"))
      .toHaveLength(1);
  });

  it("attaches Fighter's stronger third hit and kill-speed response at the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-fighter-four", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "fighter-cat", heroId: "H02", cost: 2 }, { instanceId: "fighter-dog", heroId: "H07", cost: 2 },
          { instanceId: "fighter-rabbit", heroId: "H11", cost: 1 }, { instanceId: "fighter-cow", heroId: "H16", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-fighter-four", combatSeed: "seed-fighter-four", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:fighter-cat")).toMatchObject({
      passives: expect.arrayContaining([
        expect.objectContaining({ ownerId: "C_FIGHTER", trigger: "on_every_nth_basic_attack", attackCount: 3,
          effects: [expect.objectContaining({ primitive: "deal_damage", baseValue: 350, scalesWithAttackDamage: true })] }),
        expect.objectContaining({ ownerId: "C_FIGHTER", trigger: "on_kill",
          effects: [expect.objectContaining({ primitive: "buff_stat", target: "self", stat: "attack_speed", baseValue: 150, durationTicks: 80 })] }),
      ]),
    });
  });

  it("attaches Ranger's three-second stationary damage stacks at the four-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-ranger-four", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "ranger-cat", heroId: "H03", cost: 1 }, { instanceId: "ranger-dog", heroId: "H08", cost: 2 },
          { instanceId: "ranger-rabbit", heroId: "H12", cost: 1 }, { instanceId: "ranger-exotic", heroId: "H18", cost: 3 },
          ...Array(12).fill(null),
        ],
      },
      combatId: "combat-ranger-four", combatSeed: "seed-ranger-four", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:ranger-cat")).toMatchObject({
      passives: [expect.objectContaining({
        ownerId: "C_RANGER", trigger: "on_stationary_interval", stationaryIntervalTicks: 60,
        effects: [expect.objectContaining({ primitive: "buff_stat", target: "self", stat: "attack_damage", baseValue: 80, maxStacks: 3, removeOnMove: true })],
      })],
    });
  });

  it("attaches each Exotic natural gift at the fully strengthened three-unit breakpoint", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const adapter = await import("../src/application/combat-snapshot.js") as { buildCombatSnapshot(input: unknown): CombatSnapshot };
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const snapshot = adapter.buildCombatSnapshot({
      content,
      ruleset: productionRules,
      lockedSnapshot: {
        runId: "run-exotic-one", contentVersion: "alpha-0.3.0", round: 1,
        board: [
          { instanceId: "exotic-red-panda", heroId: "H18", cost: 3 }, { instanceId: "exotic-owl", heroId: "H19", cost: 3 },
          { instanceId: "exotic-capybara", heroId: "H20", cost: 3 }, ...Array(13).fill(null),
        ],
      },
      combatId: "combat-exotic-one", combatSeed: "seed-exotic-one", rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(snapshot.units.find((unit) => unit.id === "player:exotic-red-panda")).toMatchObject({
      passives: expect.arrayContaining([expect.objectContaining({ ownerId: "R_EXOTIC", trigger: "on_basic_attack", oncePerCombat: true,
        effects: [expect.objectContaining({ primitive: "deal_damage", target: "nearest_other_enemy", baseValue: 625, scalesWithAttackDamage: true })] })]),
    });
    expect(snapshot.units.find((unit) => unit.id === "player:exotic-owl")).toMatchObject({ startingMana: 22_500 });
    expect(snapshot.units.find((unit) => unit.id === "player:exotic-capybara")).toMatchObject({
      passives: expect.arrayContaining([expect.objectContaining({ ownerId: "R_EXOTIC", trigger: "on_combat_start",
        effects: [expect.objectContaining({ primitive: "damage_reduction", target: "adjacent_allies", baseValue: 62, durationTicks: 100 })] })]),
    });
  });

  it("resolves a locked content-backed combat through the authoritative game core", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const resolver = await import("../src/application/combat-resolution.js").catch(() => undefined) as undefined | {
      resolveContentCombat(input: unknown): { result: { events: readonly unknown[]; resultHash: string; winner: "player" | "enemy" } };
    };
    expect(resolver).toBeDefined();
    if (resolver === undefined) return;
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    const resolved = resolver.resolveContentCombat({
      content,
      ruleset: productionRules,
      lockedSnapshot: { runId: "run-resolution", contentVersion: "alpha-0.3.0", round: 1, board: [{ instanceId: "hero-player", heroId: "H16", cost: 3 }, ...Array(15).fill(null)] },
      combatId: "run-resolution:1",
      combatSeed: "seed-resolution",
      rulesetVersion: "alpha-rules-0.3.0",
    });

    expect(resolved.result.events.length).toBeGreaterThan(0);
    expect(resolved.result.resultHash).toMatch(/^[0-9a-f]{16}$/);
    expect(["player", "enemy"]).toContain(resolved.result.winner);
  });

  it("resolves a tenant-owned combat run once from its locked server identity", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const commands = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const resolver = await import("../src/application/resolve-run-combat.js").catch(() => undefined) as undefined | {
      resolveRunCombat(input: unknown, dependencies: unknown): Promise<{ state: string; revision: number; combatRecord: { round: number; resultHash: string; events: readonly unknown[] }; roundRewardPlan?: { supplementalGold: number; freeRefreshes: number } }>;
    };
    expect(resolver).toBeDefined();
    if (resolver === undefined) return;
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const repository = commands.createInMemoryRunRepository();
    await repository.save({
      id: "run-authoritative-combat",
      rulesetVersion: productionRules.version,
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "COMBAT",
      round: 1,
      revision: 4,
      gold: 8,
      runSeed: "000102030405060708090a0b0c0d0e0f",
      commandResponses: {},
      lockedSnapshot: {
        runId: "run-authoritative-combat",
        contentVersion: "alpha-0.3.0",
        round: 1,
        combatId: "combat:run-authoritative-combat:1",
        combatSeed: "locked-worker-seed-1",
        rulesetVersion: productionRules.version,
        board: [{ instanceId: "hero-player", heroId: "H16", cost: 3 }, ...Array(15).fill(null)],
      },
    });

    const resolved = await resolver.resolveRunCombat({
      tenantId: "tenant-a",
      runId: "run-authoritative-combat",
    }, {
      repository,
      contentRepository: { getByVersion: async (version: string) => version === "alpha-0.3.0" ? content : undefined },
      ruleset: productionRules,
    });

    expect(resolved).toMatchObject({ state: "REWARD", revision: 5, combatRecord: { round: 1 }, roundRewardPlan: { supplementalGold: 2, freeRefreshes: 1 } });
    expect(resolved.combatRecord.resultHash).toMatch(/^[0-9a-f]{16}$/);
    expect(resolved.combatRecord.events.length).toBeGreaterThan(0);
    await expect(resolver.resolveRunCombat({ tenantId: "tenant-a", runId: "run-authoritative-combat" }, {
      repository,
      contentRepository: { getByVersion: async () => { throw new Error("content should not load on replay"); } },
      ruleset: productionRules,
    }))
      .resolves.toEqual(resolved);
    await expect(repository.get("run-authoritative-combat", "tenant-b")).resolves.toBeUndefined();
  });

  it("commits only one result when two workers resolve the same locked combat", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const commands = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const resolver = await import("../src/application/resolve-run-combat.js") as {
      resolveRunCombat(input: unknown, dependencies: unknown): Promise<{ revision: number; combatRecord: { resultHash: string } }>;
    };
    const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    const backingRepository = commands.createInMemoryRunRepository();
    await backingRepository.save({
      id: "run-concurrent-combat", rulesetVersion: productionRules.version, tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "COMBAT", round: 1, revision: 9, gold: 8, commandResponses: {},
      lockedSnapshot: {
        runId: "run-concurrent-combat", contentVersion: "alpha-0.3.0", round: 1,
        combatId: "combat:run-concurrent-combat:1", combatSeed: "locked-worker-seed-2", rulesetVersion: productionRules.version,
        board: [{ instanceId: "hero-player", heroId: "H16", cost: 3 }, ...Array(15).fill(null)],
      },
    });
    let successfulConditionalWrites = 0;
    const repository = {
      get: backingRepository.get,
      saveIfRevision: async (run: { revision: number }, expectedRevision: number) => {
        const persisted = await backingRepository.saveIfRevision(run as never, expectedRevision);
        if (persisted !== undefined) successfulConditionalWrites += 1;
        return persisted;
      },
    };
    const input = { tenantId: "tenant-a", runId: "run-concurrent-combat" };
    const dependencies = { repository, contentRepository: { getByVersion: async () => content }, ruleset: productionRules };

    const [first, second] = await Promise.all([
      resolver.resolveRunCombat(input, dependencies),
      resolver.resolveRunCombat(input, dependencies),
    ]);

    expect(successfulConditionalWrites).toBe(1);
    expect(first).toEqual(second);
    expect(await backingRepository.get("run-concurrent-combat", "tenant-a")).toMatchObject({ state: "REWARD", revision: 10, combatRecord: { resultHash: first.combatRecord.resultHash } });
  });
  const invalidShops = [
    { name: "does not contain exactly five slots", shop: [{ heroId: "H01", cost: 1 }] },
    { name: "contains an empty hero ID", shop: [{ heroId: "H01", cost: 1 }, { heroId: "  ", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] },
    { name: "contains a whitespace-padded hero ID", shop: [{ heroId: "H01", cost: 1 }, { heroId: " H02 ", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] },
    { name: "contains a cost outside the allowed range", shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 6 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] },
    { name: "contains a fractional cost", shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 1.5 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }] },
  ];

  it("creates a tenant-owned run with the Alpha initial economy", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js") & { createRun?: (input: unknown, repository: unknown) => Promise<unknown> };
    const repository = module.createInMemoryRunRepository();

    await expect(createTestRun(module, { id: "run-new", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository))
      .resolves.toMatchObject({ id: "run-new", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", rulesetVersion: productionRules.version, state: "PREPARE", revision: 0, gold: 8 });
  });

  it("creates round one with an empty bench and sixteen empty board cells", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();

    await createTestRun(module, { id: "run-layout", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository);

    await expect(repository.get("run-layout", "tenant-a")).resolves.toMatchObject({ round: 1, bench: [], board: Array(16).fill(null) });
  });

  it("moves a bench hero into an empty global board destination", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-bench", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-move", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null) });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-move", commandId: "cmd-move", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 16 }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(repository.get("run-move", "tenant-a")).resolves.toMatchObject({ bench: [], board: [hero, ...Array(15).fill(null)] });
  });

  it("swaps heroes between occupied board cells", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const first = { instanceId: "hero-first", heroId: "H01", cost: 1 };
    const second = { instanceId: "hero-second", heroId: "H02", cost: 2 };
    await repository.save({ id: "run-board-swap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [], board: [first, second, ...Array(14).fill(null)] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-board-swap", commandId: "cmd-board-swap", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: first.instanceId, destination: 17 }, repository);

    await expect(repository.get("run-board-swap", "tenant-a")).resolves.toMatchObject({ bench: [], board: [second, first, ...Array(14).fill(null)] });
  });

  it("returns the displaced board hero to the bench when swapping a bench hero", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const benchHero = { instanceId: "hero-bench", heroId: "H01", cost: 1 };
    const boardHero = { instanceId: "hero-board", heroId: "H03", cost: 3 };
    await repository.save({ id: "run-bench-swap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [benchHero], board: [boardHero, ...Array(15).fill(null)] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-bench-swap", commandId: "cmd-bench-swap", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: benchHero.instanceId, destination: 16 }, repository);

    await expect(repository.get("run-bench-swap", "tenant-a")).resolves.toMatchObject({ bench: [boardHero], board: [benchHero, ...Array(15).fill(null)] });
  });

  it("rejects a bench move into an empty board cell at the round-one capacity without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const benchHero = { instanceId: "hero-bench", heroId: "H04", cost: 1 };
    const initialRun = { id: "run-capacity", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [benchHero], board: [
      { instanceId: "hero-1", heroId: "H01", cost: 1 }, { instanceId: "hero-2", heroId: "H02", cost: 2 }, { instanceId: "hero-3", heroId: "H03", cost: 3 }, ...Array(13).fill(null),
    ] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-capacity", commandId: "cmd-capacity", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: benchHero.instanceId, destination: 19 }, repository))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-capacity", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("allows a fourth hero from the bench onto an empty board cell in round two", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const benchHero = { instanceId: "hero-round-two", heroId: "H04", cost: 1 };
    await repository.save({
      id: "run-round-two-capacity",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      round: 2,
      revision: 0,
      gold: 8,
      level: 4,
      experience: 0,
      commandResponses: {},
      bench: [benchHero],
      board: [
        { instanceId: "hero-1", heroId: "H01", cost: 1 }, { instanceId: "hero-2", heroId: "H02", cost: 2 }, { instanceId: "hero-3", heroId: "H03", cost: 3 }, ...Array(13).fill(null),
      ],
    });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-round-two-capacity", commandId: "cmd-round-two-capacity", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: benchHero.instanceId, destination: 19 }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    const updatedRun = await repository.get("run-round-two-capacity", "tenant-a");
    expect(updatedRun).toMatchObject({ bench: [] });
    expect(updatedRun?.board?.slice(0, 4)).toEqual([
      { instanceId: "hero-1", heroId: "H01", cost: 1 }, { instanceId: "hero-2", heroId: "H02", cost: 2 }, { instanceId: "hero-3", heroId: "H03", cost: 3 }, benchHero,
    ]);
  });

  it("rejects destination 24 and non-integer destinations without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-invalid-destination", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-boundary", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null) };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-boundary", commandId: "cmd-destination-24", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 32 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-boundary", commandId: "cmd-destination-fraction", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 16.5 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-boundary", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("rejects a board hero sent to its current cell without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-current-cell", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-current-cell", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [], board: [hero, ...Array(15).fill(null)] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-current-cell", commandId: "cmd-current-cell", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 16 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-current-cell", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("rejects invalid destinations and heroes not owned by the run without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-owned", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-invalid-move", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null) };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-invalid-move", commandId: "cmd-invalid-destination", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 15 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-invalid-move", commandId: "cmd-not-owned", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: "hero-not-owned", destination: 16 }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-invalid-move", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("persists the five initial shop slots supplied by the content port", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const shopGenerator = {
      initialShop: () => [
        { heroId: "H01", cost: 1 },
        { heroId: "H02", cost: 2 },
        { heroId: "H03", cost: 1 },
        { heroId: "H04", cost: 3 },
        { heroId: "H05", cost: 1 },
      ],
    };

    await expect(createTestRun(module, { id: "run-shop", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository, shopGenerator))
      .resolves.toMatchObject({ shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }] });
  });

  it("accepts a valid five-cost shop slot", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const shopGenerator = { initialShop: () => [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 5 }, { heroId: "H03", cost: 3 }, { heroId: "H04", cost: 2 }, { heroId: "H05", cost: 1 }] };

    await expect(createTestRun(module, { id: "run-high-tier-shop", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository, shopGenerator)).resolves.toMatchObject({ shop: expect.arrayContaining([{ heroId: "H02", cost: 5 }]) });
  });

  it("persists the five-slot pool and conserves a bought then sold hero across a free refresh", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const poolModule = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const content = { heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) };
    const shopGenerator = {
      createPool: ({ runSeed }: { runSeed: string }) => poolModule.createShopPool(content as never, runSeed, productionRules.shop),
      rollShop: (pool: import("../src/application/shop-pool.js").ShopPool, input: { round: number; refreshNumber: number; level: number }) => poolModule.rollShop(pool, input.level, `shop:${input.round}:${input.refreshNumber}`, productionRules.shop),
    };

    const created = await createTestRun(module,
      { id: "run-pooled-shop", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" },
      repository,
      shopGenerator as never,
      { runSeed: "000102030405060708090a0b0c0d0e0f" },
    );
    expect(created.shop).toHaveLength(5);
    expect(created.shopPool?.heroes.H01?.remainingCopies).toBe(24);

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: created.id, commandId: "cmd-pooled-buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0 }, repository, shopGenerator as never);
    const afterBuy = await repository.get(created.id, "tenant-a");
    expect(afterBuy?.shopPool?.heroes.H01?.remainingCopies).toBe(24);
    const heroInstanceId = afterBuy?.bench?.[0]?.instanceId;
    expect(heroInstanceId).toBeDefined();
    if (heroInstanceId === undefined) throw new Error("expected bought hero instance");

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: created.id, commandId: "cmd-pooled-sell", expectedRevision: 1, type: "SELL_HERO", heroInstanceId }, repository, shopGenerator as never);
    await repository.save({ ...(await repository.get(created.id, "tenant-a"))!, freeRefreshes: 1 });
    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: created.id, commandId: "cmd-pooled-free-refresh", expectedRevision: 2, type: "REFRESH_SHOP" }, repository, shopGenerator as never);

    await expect(repository.get(created.id, "tenant-a")).resolves.toMatchObject({
      gold: 8,
      freeRefreshes: 0,
      shopRefreshes: 1,
      shop: Array(5).fill({ heroId: "H01", cost: 1 }),
      shopPool: { heroes: { H01: { remainingCopies: 24 } } },
    });
  });

  it.each(invalidShops)("rejects an initial shop that $name", async ({ shop }) => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const shopGenerator = { initialShop: () => shop };

    await expect(createTestRun(module, { id: "run-invalid-initial", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository, shopGenerator))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-invalid-initial", "tenant-a")).resolves.toBeUndefined();
  });

  it("rejects a second active run for the same tenant", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await createTestRun(module, { id: "run-active-1", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository);

    await expect(createTestRun(module, { id: "run-active-2", tenantId: "tenant-a", contentVersion: "alpha-0.3.0" }, repository))
      .rejects.toThrow("ACTIVE_RUN_EXISTS");
  });

  it("buys a hero from a priced shop slot into the bench", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({ id: "run-buy", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, shop: [{ heroId: "H01", cost: 1 }], bench: [] });
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-buy", commandId: "cmd-buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0 }, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await repository.get("run-buy", "tenant-a")).toMatchObject({ gold: 7, bench: [{ heroId: "H01" }], shop: [null] });
  });

  it("sells a bench hero and returns its recorded purchase cost", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-sell",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE",
      revision: 0,
      gold: 6,
      commandResponses: {},
      bench: [{ instanceId: "hero-run-sell-1", heroId: "H02", cost: 2 }],
    });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell", commandId: "cmd-sell", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: "hero-run-sell-1" }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await repository.get("run-sell", "tenant-a")).toMatchObject({ gold: 8, revision: 1, bench: [] });
  });

  it("returns normal and Unique items to inventory when selling a bench hero", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-sell-equipped", heroId: "H02", cost: 2 };
    const normalItem = { instanceId: "item-sell-normal", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId, futureMarker: "preserve-me" };
    const uniqueItem = { instanceId: "item-sell-unique", itemId: "U01", kind: "unique" as const, equippedHeroInstanceId: hero.instanceId };
    await repository.save({ id: "run-sell-equipped", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 6, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [normalItem, uniqueItem] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell-equipped", commandId: "cmd-sell-equipped", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: hero.instanceId }, repository);

    const updatedRun = await repository.get("run-sell-equipped", "tenant-a");
    expect(updatedRun).toMatchObject({ gold: 8, bench: [] });
    expect(updatedRun?.items).toEqual([
      { instanceId: normalItem.instanceId, itemId: "I01", kind: "normal", futureMarker: "preserve-me" },
      { instanceId: uniqueItem.instanceId, itemId: "U01", kind: "unique" },
    ]);
  });

  it("removes a sold board hero and returns its equipped item to inventory", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-sell-board", heroId: "H03", cost: 3 };
    const item = { instanceId: "item-sell-board", itemId: "I02", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId };
    await repository.save({ id: "run-sell-board", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 5, commandResponses: {}, bench: [], board: [hero, ...Array(15).fill(null)], items: [item] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell-board", commandId: "cmd-sell-board", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: hero.instanceId }, repository);

    const updatedRun = await repository.get("run-sell-board", "tenant-a");
    expect(updatedRun).toMatchObject({ gold: 8, board: Array(16).fill(null) });
    expect(updatedRun?.items).toEqual([{ instanceId: item.instanceId, itemId: "I02", kind: "normal" }]);
  });

  it("keeps items equipped by other heroes when selling a hero", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const soldHero = { instanceId: "hero-sell-target", heroId: "H01", cost: 1 };
    const otherHero = { instanceId: "hero-sell-other", heroId: "H02", cost: 2 };
    const soldItem = { instanceId: "item-sell-target", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: soldHero.instanceId };
    const otherItem = { instanceId: "item-sell-other", itemId: "I02", kind: "normal" as const, equippedHeroInstanceId: otherHero.instanceId };
    await repository.save({ id: "run-sell-unrelated-item", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [soldHero, otherHero], board: Array(16).fill(null), items: [soldItem, otherItem] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell-unrelated-item", commandId: "cmd-sell-unrelated-item", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: soldHero.instanceId }, repository);

    expect((await repository.get("run-sell-unrelated-item", "tenant-a"))?.items).toEqual([
      { instanceId: soldItem.instanceId, itemId: "I01", kind: "normal" },
      otherItem,
    ]);
  });

  it("leaves equipped items unchanged when a sale is rejected", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-sell-rejected", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-sell-rejected", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [{ instanceId: "item-sell-rejected", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId }] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell-rejected", commandId: "cmd-sell-rejected", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: "hero-missing" }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");

    await expect(repository.get("run-sell-rejected", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("replays a hero sale without granting gold or returning items twice", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-sell-replay", heroId: "H03", cost: 3 };
    const item = { instanceId: "item-sell-replay", itemId: "I03", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId };
    await repository.save({ id: "run-sell-replay", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 5, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [item] });
    const input = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-sell-replay", commandId: "cmd-sell-replay", expectedRevision: 0, type: "SELL_HERO" as const, heroInstanceId: hero.instanceId };

    await expect(applyTestCommand(module, input, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(applyTestCommand(module, input, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    const updatedRun = await repository.get("run-sell-replay", "tenant-a");
    expect(updatedRun).toMatchObject({ gold: 8, bench: [] });
    expect(updatedRun?.items).toEqual([{ instanceId: item.instanceId, itemId: "I03", kind: "normal" }]);
  });

  it.each([
    { stars: 1, poolCopies: 1, remainingCopies: 20, expectedCopies: 21 },
    { stars: 2, poolCopies: 3, remainingCopies: 20, expectedCopies: 23 },
    { stars: 3, poolCopies: 9, remainingCopies: 20, expectedCopies: 29 },
  ] as const)("returns every reserved copy when selling a $stars-star hero", async ({ stars, poolCopies, remainingCopies, expectedCopies }) => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const shopPool = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const pool = shopPool.createShopPool({ heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) } as never, "000102030405060708090a0b0c0d0e0f", productionRules.shop);
    pool.heroes.H01!.remainingCopies = remainingCopies;
    const hero = { instanceId: `hero-sell-${stars}`, heroId: "H01", cost: 1, stars, poolCopies };
    await repository.save({ id: `run-sell-${stars}`, tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 6, commandResponses: {}, shopPool: pool, bench: [hero] });

    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: `run-sell-${stars}`, commandId: `cmd-sell-${stars}`, expectedRevision: 0, type: "SELL_HERO", heroInstanceId: hero.instanceId }, repository);

    await expect(repository.get(`run-sell-${stars}`, "tenant-a")).resolves.toMatchObject({ shopPool: { heroes: { H01: { remainingCopies: expectedCopies } } } });
  });

  it("rejects a sale whose star rank does not represent a valid pool quantity", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const shopPool = await import("../src/application/shop-pool.js") as typeof import("../src/application/shop-pool.js");
    const repository = module.createInMemoryRunRepository();
    const pool = shopPool.createShopPool({ heroesById: new Map([["H01", { id: "H01", cost: 1, rarity: 1 as const, is_unique_hero: false }]]) } as never, "000102030405060708090a0b0c0d0e0f", productionRules.shop);
    pool.heroes.H01!.remainingCopies = 20;
    const initialRun = { id: "run-invalid-star-sale", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 6, commandResponses: {}, shopPool: pool, bench: [{ instanceId: "hero-invalid-star", heroId: "H01", cost: 1, stars: 4, poolCopies: 3 }] };
    await repository.save(initialRun as never);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: initialRun.id, commandId: "cmd-invalid-star-sale", expectedRevision: 0, type: "SELL_HERO", heroInstanceId: "hero-invalid-star" }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get(initialRun.id, "tenant-a")).resolves.toEqual(initialRun);
  });

  it("replaces the shop through the content port when refreshed", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const shopGenerator = {
      initialShop: () => [],
      refreshShop: () => [
        { heroId: "H05", cost: 2 },
        { heroId: "H06", cost: 1 },
        { heroId: "H07", cost: 2 },
        { heroId: "H08", cost: 2 },
        { heroId: "H09", cost: 3 },
      ],
    };
    await repository.save({ id: "run-refresh", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }] });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-refresh", commandId: "cmd-refresh", expectedRevision: 0, type: "REFRESH_SHOP" }, repository, shopGenerator))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await repository.get("run-refresh", "tenant-a")).toMatchObject({
      gold: 6,
      shopRefreshes: 1,
      shop: [{ heroId: "H05", cost: 2 }, { heroId: "H06", cost: 1 }, { heroId: "H07", cost: 2 }, { heroId: "H08", cost: 2 }, { heroId: "H09", cost: 3 }],
    });
  });

  it("consumes a content-awarded free refresh before charging gold", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({
      id: "run-free-refresh", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 1, freeRefreshes: 1,
      commandResponses: {}, shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }],
    });
    const shopGenerator = {
      initialShop: () => [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }],
      refreshShop: () => [{ heroId: "H05", cost: 2 }, { heroId: "H06", cost: 1 }, { heroId: "H07", cost: 2 }, { heroId: "H08", cost: 2 }, { heroId: "H09", cost: 3 }],
    };

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-free-refresh", commandId: "cmd-free-refresh", expectedRevision: 0, type: "REFRESH_SHOP" }, repository, shopGenerator))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(repository.get("run-free-refresh", "tenant-a")).resolves.toMatchObject({ gold: 1, freeRefreshes: 0, shopRefreshes: 1 });
  });

  it.each(invalidShops)("rejects a refreshed shop that $name without mutating the run", async ({ shop }) => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const shopGenerator = { initialShop: () => [], refreshShop: () => shop };
    const initialRun = {
      id: "run-invalid-refresh",
      tenantId: "tenant-a",
      contentVersion: "alpha-0.3.0",
      state: "PREPARE" as const,
      revision: 0,
      gold: 8,
      commandResponses: {},
      shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }],
    };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-invalid-refresh", commandId: "cmd-invalid-refresh", expectedRevision: 0, type: "REFRESH_SHOP" }, repository, shopGenerator))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-invalid-refresh", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("replays an accepted refresh command without charging gold twice", async () => {
    const module = await import(modulePath).catch(() => undefined) as undefined | {
      createInMemoryRunRepository: () => { save(run: unknown): Promise<void>; get(runId: string, tenantId: string): Promise<unknown> };
      applyRunCommand: (input: unknown, repository: unknown) => Promise<{ runRevision: number; status: string }>;
    };
    expect(module).toBeDefined();
    if (module === undefined) return;

    const repository = module.createInMemoryRunRepository();
    await repository.save({ id: "run-1", tenantId: "tenant-a", state: "PREPARE", revision: 0, gold: 8, commandResponses: {} });
    const input = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-1", commandId: "cmd-1", expectedRevision: 0, type: "REFRESH_SHOP" };

    expect(await applyTestCommand(module, input, repository)).toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await applyTestCommand(module, input, repository)).toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await repository.get("run-1", "tenant-a")).toMatchObject({ gold: 6, revision: 1 });
  });

  it("rejects one of two concurrent refreshes that read the same revision", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const backingRepository = module.createInMemoryRunRepository();
    const initialRun = { id: "run-concurrent-refresh", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {} };
    await backingRepository.save(initialRun);
    const repository = {
      ...backingRepository,
      get: async () => initialRun,
    };
    const first = { actorId: "actor-a", tenantId: "tenant-a", runId: initialRun.id, commandId: "cmd-refresh-first", expectedRevision: 0, type: "REFRESH_SHOP" as const };
    const second = { ...first, commandId: "cmd-refresh-second" };

    const results = await Promise.allSettled([
      applyTestCommand(module, first, repository),
      applyTestCommand(module, second, repository),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected").map((result) => result.status === "rejected" ? result.reason.message : undefined)).toEqual(["RUN_REVISION_CONFLICT"]);
    await expect(backingRepository.get(initialRun.id, initialRun.tenantId)).resolves.toMatchObject({ revision: 1, gold: 6, shopRefreshes: 1 });
  });

  it("rejects reuse of a command ID with a different request", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({ id: "run-2", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {} });
    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-2", commandId: "cmd-reused", expectedRevision: 0, type: "REFRESH_SHOP" }, repository);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-2", commandId: "cmd-reused", expectedRevision: 1, type: "REFRESH_SHOP" }, repository))
      .rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects reuse of a move command ID for a different destination", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-idempotent", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-move-idempotent", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null) });
    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-move-idempotent", commandId: "cmd-move-idempotent", expectedRevision: 0, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 16 }, repository);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-move-idempotent", commandId: "cmd-move-idempotent", expectedRevision: 1, type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: 17 }, repository))
      .rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });

  it("rejects starting a round with an empty board without mutating the run", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const initialRun = { id: "run-start-empty", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, round: 1, revision: 0, gold: 8, commandResponses: {}, bench: [{ instanceId: "hero-bench", heroId: "H01", cost: 1 }], board: Array(16).fill(null) };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-empty", commandId: "cmd-start-empty", expectedRevision: 0, type: "START_ROUND" }, repository))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-start-empty", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("locks an immutable round snapshot of the exact board without bench or idempotency records", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const boardHero = { instanceId: "hero-board", heroId: "H01", cost: 1 };
    const benchHero = { instanceId: "hero-bench", heroId: "H02", cost: 2 };
    const equippedItem = { instanceId: "item-board", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: boardHero.instanceId };
    await repository.save({ id: "run-start-snapshot", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8, commandResponses: {}, bench: [benchHero], board: [null, boardHero, ...Array(14).fill(null)], items: [equippedItem] });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-snapshot", commandId: "cmd-start-snapshot", expectedRevision: 0, type: "START_ROUND" }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    const run = await repository.get("run-start-snapshot", "tenant-a");
    expect(run).toMatchObject({ state: "COMBAT", revision: 1, lockedSnapshot: { runId: "run-start-snapshot", contentVersion: "alpha-0.3.0", round: 1, board: [null, boardHero, ...Array(14).fill(null)] } });
    expect(run?.lockedSnapshot).toMatchObject({
      combatId: "combat:run-start-snapshot:1",
      combatSeed: expect.stringMatching(/^[0-9a-f]{32}$/),
      rulesetVersion: productionRules.version,
    });
    expect(run?.lockedSnapshot).not.toHaveProperty("bench");
    expect(run?.lockedSnapshot).not.toHaveProperty("commandResponses");
    expect(run?.lockedSnapshot?.items).toEqual([equippedItem]);
    expect(run?.lockedSnapshot?.board).not.toBe(run?.board);
    expect(run?.lockedSnapshot?.board[1]).not.toBe(run?.board?.[1]);
    expect(run?.lockedSnapshot?.items).not.toBe(run?.items);
    expect(run?.lockedSnapshot?.items?.[0]).not.toBe(run?.items?.[0]);
    expect(Object.isFrozen(run?.lockedSnapshot)).toBe(true);
    expect(Object.isFrozen(run?.lockedSnapshot?.board)).toBe(true);
    expect(Object.isFrozen(run?.lockedSnapshot?.board[1])).toBe(true);
    expect(Object.isFrozen(run?.lockedSnapshot?.items)).toBe(true);
    expect(Object.isFrozen(run?.lockedSnapshot?.items?.[0])).toBe(true);
  });

  it("locks all prepare mutations after a round starts and replays the accepted start", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const boardHero = { instanceId: "hero-lock", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-start-lock", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8, commandResponses: {}, shop: [{ heroId: "H02", cost: 2 }], bench: [], board: [boardHero, ...Array(15).fill(null)] });
    const start = { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-lock", commandId: "cmd-start-lock", expectedRevision: 0, type: "START_ROUND" as const };

    await expect(applyTestCommand(module, start, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(applyTestCommand(module, start, repository)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-lock", commandId: "cmd-buy-locked", expectedRevision: 1, type: "BUY_SHOP_HERO", shopSlotIndex: 0 }, repository))
      .rejects.toThrow("COMMAND_NOT_ALLOWED");
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-lock", commandId: "cmd-start-again", expectedRevision: 1, type: "START_ROUND" }, repository))
      .rejects.toThrow("COMMAND_NOT_ALLOWED");
    await expect(repository.get("run-start-lock", "tenant-a")).resolves.toMatchObject({ state: "COMBAT", revision: 1 });
  });

  it("rejects starting an over-cap board without mutating the run", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const board = [
      { instanceId: "hero-one", heroId: "H01", cost: 1 },
      { instanceId: "hero-two", heroId: "H02", cost: 1 },
      { instanceId: "hero-three", heroId: "H03", cost: 1 },
      { instanceId: "hero-four", heroId: "H04", cost: 1 },
      ...Array(12).fill(null),
    ];
    const initialRun = { id: "run-start-cap", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, round: 1, revision: 0, gold: 8, commandResponses: {}, bench: [], board };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-start-cap", commandId: "cmd-start-cap", expectedRevision: 0, type: "START_ROUND" }, repository))
      .rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-start-cap", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("merges three matching one-star heroes and returns all of their items to inventory", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const first = { instanceId: "hero-merge-first", heroId: "H01", cost: 1, stars: 1 as const };
    const second = { instanceId: "hero-merge-second", heroId: "H01", cost: 1, stars: 1 as const };
    await repository.save({
      id: "run-star-merge", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", round: 1, revision: 0, gold: 8, commandResponses: {},
      bench: [first, second], board: Array(16).fill(null),
      shop: [{ heroId: "H01", cost: 1 }, { heroId: "H02", cost: 2 }, { heroId: "H03", cost: 1 }, { heroId: "H04", cost: 3 }, { heroId: "H05", cost: 1 }],
      items: [
        { instanceId: "item-merge-normal", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: first.instanceId },
        { instanceId: "item-merge-unique", itemId: "U01", kind: "unique" as const, equippedHeroInstanceId: second.instanceId },
      ],
    });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-star-merge", commandId: "cmd-star-merge", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0 }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });

    await expect(repository.get("run-star-merge", "tenant-a")).resolves.toMatchObject({
      gold: 7,
      bench: [{ instanceId: first.instanceId, heroId: "H01", cost: 1, stars: 2 }],
      board: Array(16).fill(null),
      items: [
        { instanceId: "item-merge-normal", itemId: "I01", kind: "normal" },
        { instanceId: "item-merge-unique", itemId: "U01", kind: "unique" },
      ],
    });
  });

  it("abandons a prepared run and increments its revision", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    await repository.save({ id: "run-3", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {} });
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-3", commandId: "cmd-abandon", expectedRevision: 0, type: "ABANDON_RUN" }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    expect(await repository.get("run-3", "tenant-a")).toMatchObject({ state: "COMPLETE", revision: 1 });
  });

  it("equips an owned normal item on a bench hero and returns it to inventory when unequipped", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-equip", heroId: "H01", cost: 1 };
    const item = { instanceId: "item-normal", itemId: "I01", kind: "normal" as const };
    await repository.save({ id: "run-equip", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [item] });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-equip", commandId: "cmd-equip", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: item.instanceId, heroInstanceId: hero.instanceId }, repository))
      .resolves.toEqual({ runRevision: 1, status: "APPLIED" });
    await expect(repository.get("run-equip", "tenant-a")).resolves.toMatchObject({ revision: 1, items: [{ ...item, equippedHeroInstanceId: hero.instanceId }] });

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-equip", commandId: "cmd-unequip", expectedRevision: 1, type: "UNEQUIP_ITEM", itemInstanceId: item.instanceId }, repository))
      .resolves.toEqual({ runRevision: 2, status: "APPLIED" });
    await expect(repository.get("run-equip", "tenant-a")).resolves.toMatchObject({ revision: 2, items: [item] });
  });

  it("rejects an equip that would give a hero a third item without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-full", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-third-item", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [
      { instanceId: "item-one", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId },
      { instanceId: "item-two", itemId: "I02", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId },
      { instanceId: "item-three", itemId: "I03", kind: "normal" as const },
    ] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-third-item", commandId: "cmd-third", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "item-three", heroInstanceId: hero.instanceId }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-third-item", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("rejects a second Unique on one hero and any command against a run containing two Unique instances", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-unique", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-unique", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [
      { instanceId: "unique-equipped", itemId: "U01", kind: "unique" as const, equippedHeroInstanceId: hero.instanceId },
      { instanceId: "unique-other", itemId: "U02", kind: "unique" as const },
    ] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-unique", commandId: "cmd-second-unique", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "unique-other", heroInstanceId: hero.instanceId }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-unique", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("rejects non-owned or already-equipped items without mutation", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-owned", heroId: "H01", cost: 1 };
    const initialRun = { id: "run-item-ownership", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE" as const, revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [{ instanceId: "item-equipped", itemId: "I01", kind: "normal" as const, equippedHeroInstanceId: hero.instanceId }] };
    await repository.save(initialRun);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-item-ownership", commandId: "cmd-not-owned", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "missing-item", heroInstanceId: hero.instanceId }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-item-ownership", commandId: "cmd-equipped", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "item-equipped", heroInstanceId: hero.instanceId }, repository)).rejects.toThrow("GAME_RULE_VIOLATION");
    await expect(repository.get("run-item-ownership", "tenant-a")).resolves.toEqual(initialRun);
  });

  it("rejects item command idempotency key reuse when its item payload changes", async () => {
    const module = await import(modulePath) as typeof import("../src/application/run-commands.js");
    const repository = module.createInMemoryRunRepository();
    const hero = { instanceId: "hero-idempotent-item", heroId: "H01", cost: 1 };
    await repository.save({ id: "run-item-idempotency", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "PREPARE", revision: 0, gold: 8, commandResponses: {}, bench: [hero], board: Array(16).fill(null), items: [{ instanceId: "item-first", itemId: "I01", kind: "normal" }, { instanceId: "item-second", itemId: "I02", kind: "normal" }] });
    await applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-item-idempotency", commandId: "cmd-item-reused", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "item-first", heroInstanceId: hero.instanceId }, repository);

    await expect(applyTestCommand(module, { actorId: "actor-a", tenantId: "tenant-a", runId: "run-item-idempotency", commandId: "cmd-item-reused", expectedRevision: 0, type: "EQUIP_ITEM", itemInstanceId: "item-second", heroInstanceId: hero.instanceId }, repository)).rejects.toThrow("IDEMPOTENCY_KEY_REUSED");
  });
});
