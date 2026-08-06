export type HeroRarity = 1 | 2 | 3 | 4 | 5;
export type ShopOdds = readonly [number, number, number, number, number];

export interface RuleRowRange {
  readonly start: number;
  readonly end: number;
}

export interface BoardRules {
  readonly columns: number;
  readonly rows: number;
  readonly enemyRows: RuleRowRange;
  readonly playerRows: RuleRowRange;
  readonly movement: "orthogonal";
}

export interface CombatRules {
  readonly tickRate: number;
  readonly maxTicks: number;
}

export interface RosterRules {
  readonly benchSlots: number;
  readonly maxItemsPerHero: number;
  readonly maxUniquePerTeam: number;
}

export interface ShopRules {
  readonly slotCount: number;
  readonly refreshCost: number;
  readonly copiesByRarity: Readonly<Record<HeroRarity, number>>;
  readonly oddsByLevel: Readonly<Record<number, ShopOdds>>;
}

export interface ProgressionLevelRule {
  readonly level: number;
  readonly xpToNext: number;
  readonly boardCap: number;
}

export interface ProgressionRules {
  readonly initialLevel: number;
  readonly maxLevel: number;
  readonly xpPurchaseCost: number;
  readonly xpPerPurchase: number;
  readonly levels: readonly ProgressionLevelRule[];
}

export interface AdventureRules {
  readonly initialHealth: number;
  readonly initialGold: number;
  readonly baseRoundIncome: number;
  readonly roundCount: number;
  readonly uniqueRevealRound: number;
}

export interface StreakBonusRule {
  readonly count: number;
  readonly bonus: number;
}

export interface StandardRules {
  readonly initialHealth: number;
  readonly initialGold: number;
  readonly baseRoundIncome: number;
  readonly interestStep: number;
  readonly interestCap: number;
  readonly streakBonusCap: number;
  readonly streakBonuses: readonly StreakBonusRule[];
}

export interface CompiledRuleset {
  readonly version: string;
  readonly rulesetHash: string;
  readonly combat: CombatRules;
  readonly board: BoardRules;
  readonly roster: RosterRules;
  readonly shop: ShopRules;
  readonly progression: ProgressionRules;
  readonly adventure: AdventureRules;
  readonly standard: StandardRules;
}
