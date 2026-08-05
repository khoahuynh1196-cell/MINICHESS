import { describe, expect, it } from "vitest";

import { fnv1a64Hex, sha256Hex, stableStringify } from "../../src/serialization/canonical-json.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] }))
      .toBe('{"a":{"x":3,"y":2},"list":[2,1],"z":1}');
  });

  it("keeps the legacy FNV digest stable", () => {
    expect(fnv1a64Hex("abc")).toBe("e71fa2190541574b");
  });

  it("uses a 64-character SHA-256 digest for new rulesets", () => {
    expect(sha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
  });

  it("rejects undefined", () => {
    expect(() => stableStringify({ value: undefined })).toThrow("Unsupported canonical JSON value");
  });
});
