import { runHeadlessCombat, type CombatResult } from "@auto-battler/game-core";
import { buildCombatSnapshot, type BuildCombatSnapshotInput } from "./combat-snapshot.js";

export interface ContentCombatResolution {
  readonly snapshot: ReturnType<typeof buildCombatSnapshot>;
  readonly result: CombatResult;
}

export function resolveContentCombat(input: BuildCombatSnapshotInput): ContentCombatResolution {
  const snapshot = buildCombatSnapshot(input);
  return Object.freeze({ snapshot, result: runHeadlessCombat(snapshot) });
}
