import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertOfflineReleaseCompatibility,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
} from "../../src/index.js";

const releasePath = fileURLToPath(new URL("../../../releases/offline-foundation-0.1.0/release.json", import.meta.url));
const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const release = compileOfflineRelease(JSON.parse(readFileSync(releasePath, "utf8")));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function assertCompatible(overrides: Partial<Parameters<typeof assertOfflineReleaseCompatibility>[0]> = {}): void {
  assertOfflineReleaseCompatibility({
    release,
    rules,
    content,
    assetRevision: "original-chibi-cutouts-v3",
    clientSchema: 1,
    ...overrides,
  });
}

describe("offline release compatibility", () => {
  it("locks the rules, content, assets, and client schema into one playable release", () => {
    expect(release).toEqual({
      version: "offline-foundation-0.1.0",
      mode: "adventure",
      ruleset: {
        version: "production-rules-0.1.0",
        hash: "c9a4211a17a19059eab267527fe509b589c55025819330433a9a1e28130abdb5",
      },
      content: { version: "alpha-0.3.0", hash: "8c7f11c01e670b1e" },
      assets: { revision: "original-chibi-cutouts-v3" },
      minimumClientSchema: 1,
    });
    expect(assertCompatible).not.toThrow();
  });

  it("rejects a ruleset with a different hash even when its version matches", () => {
    const incompatibleRules = Object.freeze({ ...rules, rulesetHash: "0".repeat(64) });

    expect(() => assertCompatible({ rules: incompatibleRules }))
      .toThrow("RELEASE_RULESET_HASH_MISMATCH");
  });

  it("rejects content with an unexpected immutable hash", () => {
    const incompatibleContent = Object.freeze({ ...content, contentHash: "0".repeat(16) });

    expect(() => assertCompatible({ content: incompatibleContent }))
      .toThrow("RELEASE_CONTENT_HASH_MISMATCH");
  });

  it("rejects the wrong asset revision", () => {
    expect(() => assertCompatible({ assetRevision: "placeholder-art" }))
      .toThrow("RELEASE_ASSET_REVISION_MISMATCH");
  });

  it("rejects a client save/runtime schema below the release minimum", () => {
    expect(() => assertCompatible({ clientSchema: 0 }))
      .toThrow("RELEASE_CLIENT_SCHEMA_UNSUPPORTED:0:1");
  });

  it("rejects malformed digest declarations", () => {
    const raw = JSON.parse(readFileSync(releasePath, "utf8"));
    raw.ruleset.hash = "NOT-A-HASH";

    expect(() => compileOfflineRelease(raw))
      .toThrow("release.ruleset.hash must be a 16- or 64-character lowercase hexadecimal digest");
  });
});
