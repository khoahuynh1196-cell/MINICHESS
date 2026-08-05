import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const bundlePath = fileURLToPath(new URL("../../content/alpha-0.4.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../rules/production-0.1.0/ruleset.json", import.meta.url));

describe("runtime composition", () => {
  it("loads compatible content and rules and serves the immutable content manifest", async () => {
    const { createRuntimeApp } = await import("../src/runtime.js");
    const app = await createRuntimeApp({ contentPath: bundlePath, rulesPath });

    const response = await app.inject({ method: "GET", url: "/v1/content/alpha-0.4.0/manifest" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { content_version: "alpha-0.4.0", manifest: { heroCount: 20, normalItemCount: 12, uniqueItemCount: 6 } } });
    await app.close();
  });

  it("derives repeatable five-slot shops from the compiled hero pool and ruleset", async () => {
    const { loadCompiledContent, loadCompiledRuleset, createContentShopGenerator } = await import("../src/runtime.js");
    const content = loadCompiledContent(bundlePath);
    const ruleset = loadCompiledRuleset(rulesPath);
    const shop = createContentShopGenerator(content, ruleset);
    const runSeed = "000102030405060708090a0b0c0d0e0f";
    const input = { id: "run-runtime", contentVersion: content.version, rulesetVersion: ruleset.version, runSeed };
    const firstPool = shop.createPool!(input);
    const secondPool = shop.createPool!(input);
    const initial = shop.rollShop!(firstPool, { round: 1, refreshNumber: 0, level: ruleset.progression.initialLevel });

    expect(initial).toHaveLength(ruleset.shop.slotCount);
    expect(shop.rollShop!(secondPool, { round: 1, refreshNumber: 0, level: ruleset.progression.initialLevel })).toEqual(initial);
    expect(shop.rollShop!(firstPool, { round: 1, refreshNumber: 1, level: ruleset.progression.initialLevel })).toHaveLength(ruleset.shop.slotCount);
    expect(initial.every((slot) => content.heroesById.get(slot.heroId)?.cost === slot.cost)).toBe(true);
  });
});
