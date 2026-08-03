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

  it("derives repeatable four-slot shops from the compiled hero content", async () => {
    const { loadCompiledContent, createContentShopGenerator } = await import("../src/runtime.js");
    const content = loadCompiledContent(bundlePath);
    const shop = createContentShopGenerator(content);
    const initial = shop.initialShop({ id: "run-runtime", contentVersion: content.version });

    expect(initial).toHaveLength(4);
    expect(shop.initialShop({ id: "run-runtime", contentVersion: content.version })).toEqual(initial);
    expect(shop.refreshShop?.({ id: "run-runtime", contentVersion: content.version, refreshNumber: 1 })).toHaveLength(4);
    expect(initial.every((slot) => content.heroesById.get(slot.heroId)?.cost === slot.cost)).toBe(true);
  });
});
