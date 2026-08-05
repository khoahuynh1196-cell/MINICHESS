import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle, compileRuleset } from "@auto-battler/game-core";
import { createRun, applyRunCommand, createInMemoryRunRepository } from "../src/application/run-commands.js";
import { createShopPool, rollShop } from "../src/application/shop-pool.js";
import { createContentShopGenerator } from "../src/runtime.js";

const rulesPath = fileURLToPath(new URL("../../rules/production-0.1.0/ruleset.json", import.meta.url));
const contentPath = fileURLToPath(new URL("../../content/alpha-0.4.0/bundle.json", import.meta.url));
const rawRules = JSON.parse(readFileSync(rulesPath, "utf8"));
const ruleset = compileRuleset(rawRules);
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));

function dependencies(repository = createInMemoryRunRepository()) {
  return {
    repository,
    shopGenerator: createContentShopGenerator(content, ruleset),
    ruleset,
  };
}

describe("rules-driven Adventure shell", () => {
  it("creates a production-rules Adventure run with a five-slot shop and sixteen local board cells", async () => {
    const deps = dependencies();
    const run = await createRun({
      id: "run-rules-create",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, deps, { runSeed: "00112233445566778899aabbccddeeff", uniqueItemIds: content.uniqueItems.map((item) => item.id) });

    expect(run).toMatchObject({
      rulesetVersion: "production-rules-0.1.0",
      gold: 8,
      health: 30,
      level: 3,
    });
    expect(run.shop).toHaveLength(5);
    expect(run.board).toHaveLength(16);
  });

  it("uses global player cell 16 and rejects the legacy destination 12", async () => {
    const repository = createInMemoryRunRepository();
    const deps = dependencies(repository);
    const run = await createRun({
      id: "run-rules-move",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, deps, { runSeed: "00112233445566778899aabbccddeeff" });
    await repository.save({
      ...run,
      bench: [{ instanceId: "hero-bench", heroId: "H01", cost: 1, stars: 1, poolCopies: 1 }],
    });

    await expect(applyRunCommand({
      actorId: "actor-a",
      tenantId: "tenant-a",
      runId: run.id,
      commandId: "move-valid",
      expectedRevision: 0,
      type: "MOVE_HERO",
      heroInstanceId: "hero-bench",
      destination: 16,
    }, deps)).resolves.toEqual({ runRevision: 1, status: "APPLIED" });

    const secondRepository = createInMemoryRunRepository();
    const secondDeps = dependencies(secondRepository);
    const secondRun = await createRun({
      id: "run-rules-legacy-move",
      tenantId: "tenant-b",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, secondDeps, { runSeed: "ffeeddccbbaa99887766554433221100" });
    await secondRepository.save({
      ...secondRun,
      bench: [{ instanceId: "hero-bench", heroId: "H01", cost: 1, stars: 1, poolCopies: 1 }],
    });

    await expect(applyRunCommand({
      actorId: "actor-b",
      tenantId: "tenant-b",
      runId: secondRun.id,
      commandId: "move-legacy",
      expectedRevision: 0,
      type: "MOVE_HERO",
      heroInstanceId: "hero-bench",
      destination: 12,
    }, secondDeps)).rejects.toThrow("GAME_RULE_VIOLATION");
  });

  it("rejects XP purchase at ruleset level nine", async () => {
    const repository = createInMemoryRunRepository();
    const deps = dependencies(repository);
    const run = await createRun({
      id: "run-rules-level-cap",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, deps, { runSeed: "00112233445566778899aabbccddeeff" });
    await repository.save({ ...run, level: 9, experience: 0, gold: 99 });

    await expect(applyRunCommand({
      actorId: "actor-a",
      tenantId: "tenant-a",
      runId: run.id,
      commandId: "buy-xp-at-cap",
      expectedRevision: 0,
      type: "BUY_XP",
    }, deps)).rejects.toThrow("GAME_RULE_VIOLATION");
  });

  it("uses supplied shop copy counts and odds instead of hardcoded tables", () => {
    const customRaw = structuredClone(rawRules);
    customRaw.shop.copies_by_rarity["1"] = 7;
    customRaw.shop.odds_by_level[3] = [100, 0, 0, 0, 0];
    const customRules = compileRuleset(customRaw);
    const pool = createShopPool(content, "00112233445566778899aabbccddeeff", customRules.shop);

    const tierOne = Object.values(pool.heroes).filter((hero) => hero.rarity === 1);
    expect(tierOne.length).toBeGreaterThan(0);
    expect(tierOne.every((hero) => hero.totalCopies === 7 && hero.remainingCopies === 7)).toBe(true);
    expect(rollShop(pool, 3, "shop:1:0", customRules.shop)).toHaveLength(customRules.shop.slotCount);
  });
  it("rejects create and command paths when the locked ruleset version does not match", async () => {
    const repository = createInMemoryRunRepository();
    const deps = dependencies(repository);

    await expect(createRun({
      id: "run-rules-mismatch-create",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: "production-rules-9.9.9",
    }, deps)).rejects.toThrow("RULESET_VERSION_MISMATCH");

    const run = await createRun({
      id: "run-rules-mismatch-command",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, deps, { runSeed: "00112233445566778899aabbccddeeff" });
    await repository.save({ ...run, rulesetVersion: "production-rules-9.9.9" });

    await expect(applyRunCommand({
      actorId: "actor-a",
      tenantId: "tenant-a",
      runId: run.id,
      commandId: "mismatched-refresh",
      expectedRevision: 0,
      type: "REFRESH_SHOP",
    }, deps)).rejects.toThrow("RULESET_VERSION_MISMATCH");
  });

  it("rejects a persisted board whose shape does not match the locked ruleset", async () => {
    const repository = createInMemoryRunRepository();
    const deps = dependencies(repository);
    const run = await createRun({
      id: "run-rules-board-shape",
      tenantId: "tenant-a",
      contentVersion: content.version,
      rulesetVersion: ruleset.version,
    }, deps, { runSeed: "00112233445566778899aabbccddeeff" });
    await repository.save({ ...run, board: Array(12).fill(null) });

    await expect(applyRunCommand({
      actorId: "actor-a",
      tenantId: "tenant-a",
      runId: run.id,
      commandId: "invalid-board-refresh",
      expectedRevision: 0,
      type: "REFRESH_SHOP",
    }, deps)).rejects.toThrow("GAME_RULE_VIOLATION");
  });

});
