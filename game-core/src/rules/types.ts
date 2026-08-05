export interface RuleRowRange {
  readonly start: number;
  readonly end: number;
}

export interface BoardGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly enemyRows: RuleRowRange;
  readonly playerRows: RuleRowRange;
  readonly movement: "orthogonal";
}

export interface ProgressionLevelRule {
  readonly level: number;
  readonly xpToNext: number;
  readonly boardCap: number;
}

export type RulesetRarity = 1 | 2 | 3 | 4 | 5;
export type ShopOddsTuple = readonly [number, number, number, number, number];

export interface CompiledRuleset {
  readonly version: string;
  readonly rulesetHash: string;
  readonly tickRate: number;
  readonly maxCombatTicks: number;
  readonly board: BoardGeometry;
  readonly roster: Readonly<{
    benchSlots: number;
    maxItemsPerHero: number;
    maxUniquePerTeam: number;
  }>;
  readonly shop: Readonly<{
    slotCount: number;
    refreshCost: number;
    copiesByRarity: Readonly<Record<RulesetRarity, number>>;
    oddsByLevel: Readonly<Record<number, ShopOddsTuple>>;
  }>;
  readonly progression: Readonly<{
    initialLevel: number;
    maxLevel: number;
    xpPurchaseCost: number;
    xpPerPurchase: number;
    levels: readonly ProgressionLevelRule[];
  }>;
  readonly adventure: Readonly<{
    initialHealth: number;
    initialGold: number;
    baseRoundIncome: number;
    roundCount: number;
    uniqueRevealRound: number;
    lossDamage: Readonly<{
      base: number;
      perSurvivor: number;
      cap: number;
    }>;
  }>;
  readonly standard: Readonly<{
    initialHealth: number;
    initialGold: number;
    baseRoundIncome: number;
    interestThreshold: number;
    interestPerThreshold: number;
    interestCap: number;
    streakBonusCap: number;
    planningSecondsEarly: number;
    planningSecondsLate: number;
  }>;
}
