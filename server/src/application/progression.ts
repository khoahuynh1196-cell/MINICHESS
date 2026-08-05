import type { CompiledRuleset } from "@auto-battler/game-core";
import type { RunRecord } from "./run-commands.js";

export interface RunProgression {
  readonly level: number;
  readonly experience: number;
  readonly experienceToNext: number;
  readonly boardCap: number;
}

function levelRule(ruleset: CompiledRuleset, level: number) {
  return ruleset.progression.levels.find((candidate) => candidate.level === level);
}

export function progressionForRun(
  run: Pick<RunRecord, "level" | "experience">,
  ruleset: CompiledRuleset,
): RunProgression {
  const level = run.level ?? ruleset.progression.initialLevel;
  const experience = run.experience ?? 0;
  const rule = levelRule(ruleset, level);
  if (rule === undefined || !Number.isSafeInteger(experience) || experience < 0
    || (rule.xpToNext === 0 ? experience !== 0 : experience >= rule.xpToNext)) {
    throw new Error("GAME_RULE_VIOLATION");
  }
  return Object.freeze({
    level,
    experience,
    experienceToNext: rule.xpToNext,
    boardCap: rule.boardCap,
  });
}

export function buyExperience(
  progression: RunProgression,
  ruleset: CompiledRuleset,
): Pick<RunProgression, "level" | "experience"> {
  let level = progression.level;
  let experience = progression.experience + ruleset.progression.xpPerPurchase;
  for (;;) {
    const rule = levelRule(ruleset, level);
    if (rule === undefined) throw new Error("GAME_RULE_VIOLATION");
    if (rule.xpToNext === 0) return Object.freeze({ level, experience: 0 });
    if (experience < rule.xpToNext) return Object.freeze({ level, experience });
    experience -= rule.xpToNext;
    level += 1;
    if (level > ruleset.progression.maxLevel) throw new Error("GAME_RULE_VIOLATION");
  }
}
