import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle } from "../../src/index.js";

const legacyBundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const migratedBundlePath = fileURLToPath(new URL("../../../content/alpha-0.4.0/bundle.json", import.meta.url));
const expectedManifest = {
  heroCount: 20,
  shopHeroCount: 20,
  uniqueHeroCount: 0,
  skillCount: 20,
  traitCount: 10,
  normalItemCount: 12,
  uniqueItemCount: 6,
  transformationCount: 6,
  encounterCount: 8,
};

describe("Alpha content manifest", () => {
  it("preserves the immutable alpha-0.3.0 digest", () => {
    const first = compileContentBundle(JSON.parse(readFileSync(legacyBundlePath, "utf8")));
    const second = compileContentBundle(JSON.parse(readFileSync(legacyBundlePath, "utf8")));
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.version).toBe("alpha-0.3.0");
    expect(first.contentHash).toBe("8c7f11c01e670b1e");
    expect(first.manifest).toEqual(expectedManifest);
  });

  it("locks the reviewed alpha-0.4.0 migrated digest", () => {
    const first = compileContentBundle(JSON.parse(readFileSync(migratedBundlePath, "utf8")));
    const second = compileContentBundle(JSON.parse(readFileSync(migratedBundlePath, "utf8")));
    expect(second.contentHash).toBe(first.contentHash);
    expect(first.version).toBe("alpha-0.4.0");
    expect(first.contentHash).toBe("90a88bdd04c7de05");
    expect(first.manifest).toEqual(expectedManifest);
  });
});
