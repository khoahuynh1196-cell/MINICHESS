import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle } from "../../src/index.js";

const bundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));

describe("Alpha content manifest", () => {
  it("reports a deterministic inventory manifest for the approved Alpha bundle", () => {
    const raw = JSON.parse(readFileSync(bundlePath, "utf8"));
    const first = compileContentBundle(raw);
    const second = compileContentBundle(raw);

    expect(second.contentHash).toBe(first.contentHash);
    expect(first.contentHash).toBe("8c7f11c01e670b1e");
    expect(first.manifest).toEqual({
      heroCount: 20,
      shopHeroCount: 20,
      uniqueHeroCount: 0,
      skillCount: 20,
      traitCount: 10,
      normalItemCount: 12,
      uniqueItemCount: 6,
      transformationCount: 6,
      encounterCount: 8,
    });
  });
});
