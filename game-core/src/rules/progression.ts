import type { CompiledRuleset, ProgressionLevelRule, ShopOdds } from "./types.js";

type ProgressionContract = Pick<CompiledRuleset, "progression" | "shop">;

export interface ProgressionState {
  readonly level: number;
  readonly experience: number;
  readonly xpToNext: number;
  readonly boardCap: number;
}

function levelRule(rules: ProgressionContract, level: number): ProgressionLevelRule {
  if (!Number.isSafeInteger(level)) throw new Error("level must be a safe integer");
  const found = rules.progression.levels.find((entry) => entry.level === level);
  if (found === undefined) throw new Error(`Unsupported player level: ${level}`);
  return found;
}

export function progressionState(rules: ProgressionContract, level: number, experience: number): ProgressionState {
  if (!Number.isSafeInteger(experience) || experience < 0) throw new Error("experience must be a safe integer >= 0");
  const current = levelRule(rules, level);
  if (current.xpToNext === 0 ? experience !== 0 : experience >= current.xpToNext) {
    throw new Error("experience is outside the current level range");
  }
  return Object.freeze({ level, experience, xpToNext: current.xpToNext, boardCap: current.boardCap });
}

export function initialProgressionState(rules: ProgressionContract): ProgressionState {
  return progressionState(rules, rules.progression.initialLevel, 0);
}

export function canBuyExperience(rules: ProgressionContract, state: Pick<ProgressionState, "level" | "experience">): boolean {
  const current = progressionState(rules, state.level, state.experience);
  return current.level < rules.progression.maxLevel;
}

export function buyExperience(
  rules: ProgressionContract,
  state: Pick<ProgressionState, "level" | "experience">,
): ProgressionState {
  let current = progressionState(rules, state.level, state.experience);
  if (current.level === rules.progression.maxLevel) throw new Error("Player is already at maximum level");

  let level = current.level;
  let experience = current.experience + rules.progression.xpPerPurchase;
  while (level < rules.progression.maxLevel) {
    const threshold = levelRule(rules, level).xpToNext;
    if (experience < threshold) break;
    experience -= threshold;
    level += 1;
  }
  if (level === rules.progression.maxLevel) experience = 0;
  return progressionState(rules, level, experience);
}

export function shopOddsAtLevel(rules: ProgressionContract, level: number): ShopOdds {
  levelRule(rules, level);
  const odds = rules.shop.oddsByLevel[level];
  if (odds === undefined) throw new Error(`Missing shop odds for level: ${level}`);
  return odds;
}
