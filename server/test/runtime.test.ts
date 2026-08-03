import { describe, expect, it } from "vitest";
import { fileURLToPath } from "node:url";

const bundlePath = fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url));

describe("runtime composition", () => {
  it("loads the Alpha bundle and serves its immutable manifest", async () => {
    const { createRuntimeApp } = await import("../src/runtime.js");
    const app = await createRuntimeApp({ contentPath: bundlePath });

    const response = await app.inject({ method: "GET", url: "/v1/content/alpha-0.3.0/manifest" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ data: { content_version: "alpha-0.3.0", manifest: { heroCount: 20, normalItemCount: 12, uniqueItemCount: 6 } } });
    await app.close();
  });

  it("derives repeatable five-slot shops from the compiled hero pool", async () => {
    const { loadCompiledContent, createContentShopGenerator } = await import("../src/runtime.js");
    const content = loadCompiledContent(bundlePath);
    const shop = createContentShopGenerator(content);
    const runSeed = "000102030405060708090a0b0c0d0e0f";
    const firstPool = shop.createPool!({ id: "run-runtime", contentVersion: content.version, runSeed });
    const secondPool = shop.createPool!({ id: "run-runtime", contentVersion: content.version, runSeed });
    const initial = shop.rollShop!(firstPool, { round: 1, refreshNumber: 0, level: 1 });

    expect(initial).toHaveLength(5);
    expect(shop.rollShop!(secondPool, { round: 1, refreshNumber: 0, level: 1 })).toEqual(initial);
    expect(shop.rollShop!(firstPool, { round: 1, refreshNumber: 1, level: 1 })).toHaveLength(5);
    expect(initial.every((slot) => content.heroesById.get(slot.heroId)?.cost === slot.cost)).toBe(true);
  });
});
