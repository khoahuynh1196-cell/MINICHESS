import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../../src/serialization/canonical-json.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] }))
      .toBe('{"a":{"x":3,"y":2},"list":[2,1],"z":1}');
  });

  it("produces an identical SHA-256 digest for equivalent key orderings", () => {
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
    expect(sha256Hex({ a: 1 })).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects values that cannot exist in authored JSON", () => {
    expect(() => stableStringify({ value: undefined })).toThrow("Unsupported canonical JSON value: undefined");
    expect(() => stableStringify(Number.NaN)).toThrow("Unsupported canonical JSON value: number");
  });
});
