import { createHash } from "node:crypto";

function unsupported(value: unknown): never {
  const kind = value === undefined ? "undefined" : typeof value;
  throw new Error(`Unsupported canonical JSON value: ${kind}`);
}

export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return unsupported(value);
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      const entry = record[key];
      if (entry === undefined) return unsupported(entry);
      return `${JSON.stringify(key)}:${stableStringify(entry)}`;
    }).join(",")}}`;
  }
  return unsupported(value);
}

export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
