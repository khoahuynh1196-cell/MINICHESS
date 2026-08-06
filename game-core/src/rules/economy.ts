import type { CompiledRuleset } from "./types.js";

type EconomyContract = Pick<CompiledRuleset, "adventure" | "standard">;

export interface IncomeBreakdown {
  readonly base: number;
  readonly interest: number;
  readonly streak: number;
  readonly total: number;
}

function safeInteger(value: number, label: string, minimum: number): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
}

export function adventureRoundIncome(rules: EconomyContract): IncomeBreakdown {
  const base = rules.adventure.baseRoundIncome;
  return Object.freeze({ base, interest: 0, streak: 0, total: base });
}

export function standardStreakBonus(rules: EconomyContract, streakCount: number): number {
  if (!Number.isSafeInteger(streakCount)) throw new Error("streakCount must be a safe integer");
  const absoluteCount = Math.abs(streakCount);
  let bonus = 0;
  for (const threshold of rules.standard.streakBonuses) {
    if (absoluteCount < threshold.count) break;
    bonus = threshold.bonus;
  }
  return Math.min(bonus, rules.standard.streakBonusCap);
}

export function standardRoundIncome(
  rules: EconomyContract,
  goldBeforeIncome: number,
  streakCount: number,
): IncomeBreakdown {
  safeInteger(goldBeforeIncome, "goldBeforeIncome", 0);
  const base = rules.standard.baseRoundIncome;
  const interest = Math.min(
    Math.floor(goldBeforeIncome / rules.standard.interestStep),
    rules.standard.interestCap,
  );
  const streak = standardStreakBonus(rules, streakCount);
  return Object.freeze({ base, interest, streak, total: base + interest + streak });
}
