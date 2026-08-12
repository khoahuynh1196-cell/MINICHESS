import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { CANONICAL_CONTENT_VERSION, compileContentBundle } from "../../src/index.js";

describe("canonical content version", () => {
  it("compiles the immutable alpha-0.4.0 content bundle", () => {
    const path = fileURLToPath(new URL("../../../content/alpha-0.4.0/bundle.json", import.meta.url));
    const content = compileContentBundle(JSON.parse(readFileSync(path, "utf8")));
    expect(content.version).toBe(CANONICAL_CONTENT_VERSION);
    expect(content.manifest).toMatchObject({ heroCount: 20, shopHeroCount: 20, encounterCount: 8 });
  });
});
