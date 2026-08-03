import { createHmac } from "node:crypto";

const RUN_SEED_HEX = /^[0-9a-f]{32,}$/i;

/** Selects the one hidden Unique for a run without exposing its private seed. */
export function selectRunUniqueId(runSeed: string, uniqueItemIds: readonly string[]): string {
  if (!RUN_SEED_HEX.test(runSeed) || runSeed.length % 2 !== 0) throw new Error("GAME_RULE_VIOLATION");
  const candidates = [...uniqueItemIds].sort();
  if (candidates.length === 0 || candidates.some((id, index) => !/^U\d+$/.test(id) || candidates[index - 1] === id)) {
    throw new Error("GAME_RULE_VIOLATION");
  }

  const digest = createHmac("sha256", Buffer.from(runSeed, "hex")).update("unique:v1").digest();
  const index = Number(digest.readBigUInt64BE(0) % BigInt(candidates.length));
  return candidates[index]!;
}
