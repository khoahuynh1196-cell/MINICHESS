import { createHash } from "node:crypto";

function unsupported(value: unknown): never {
  const kind = value === undefined ? "undefined" : typeof value;
  throw new Error(`Unsupported canonical JSON value: ${kind}`);
}

/** Serializes JSON-safe data with recursively sorted object keys. */
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
    const fields = Object.keys(record).sort().map((key) => {
      const entry = record[key];
      if (entry === undefined) return unsupported(entry);
      return `${JSON.stringify(key)}:${stableStringify(entry)}`;
    });
    return `{${fields.join(",")}}`;
  }
  return unsupported(value);
}

/** SHA-256 digest for new versioned contracts such as production rulesets. */
export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
