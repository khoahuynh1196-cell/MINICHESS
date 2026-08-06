import { sha256Hex } from "../serialization/canonical-json.js";
import type {
  AdventureRules,
  BoardRules,
  CombatRules,
  CompiledRuleset,
  HeroRarity,
  ProgressionLevelRule,
  ProgressionRules,
  RosterRules,
  RuleRowRange,
  ShopOdds,
  ShopRules,
  StandardRules,
} from "./types.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object`);
  return value;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`${label} must be a non-empty string`);
  return value;
}

function requireInteger(value: unknown, label: string, minimum = 0): number {
  if (!Number.isSafeInteger(value) || (value as number) < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value as number;
}

function requireArray(value: unknown, label: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value;
}

function compileRowRange(value: unknown, label: string, rows: number): RuleRowRange {
  const raw = requireRecord(value, label);
  const start = requireInteger(raw.start, `${label}.start`);
  const end = requireInteger(raw.end, `${label}.end`);
  if (start > end) throw new Error(`${label}.start must be <= ${label}.end`);
  if (end >= rows) throw new Error(`${label}.end must be < board.rows`);
  return Object.freeze({ start, end });
}

function compileBoard(value: unknown): BoardRules {
  const raw = requireRecord(value, "board");
  const columns = requireInteger(raw.columns, "board.columns", 1);
  const rows = requireInteger(raw.rows, "board.rows", 2);
  const enemyRows = compileRowRange(raw.enemy_rows, "board.enemy_rows", rows);
  const playerRows = compileRowRange(raw.player_rows, "board.player_rows", rows);
  if (enemyRows.start !== 0 || playerRows.end !== rows - 1 || enemyRows.end + 1 !== playerRows.start) {
    throw new Error("board side rows must cover the board without gaps or overlap");
  }
  if (raw.movement !== "orthogonal") throw new Error("board.movement must be orthogonal");
  return Object.freeze({ columns, rows, enemyRows, playerRows, movement: "orthogonal" });
}

function compileCombat(value: unknown): CombatRules {
  const raw = requireRecord(value, "combat");
  return Object.freeze({
    tickRate: requireInteger(raw.tick_rate, "combat.tick_rate", 1),
    maxTicks: requireInteger(raw.max_ticks, "combat.max_ticks", 1),
  });
}

function compileRoster(value: unknown): RosterRules {
  const raw = requireRecord(value, "roster");
  const benchSlots = requireInteger(raw.bench_slots, "roster.bench_slots", 1);
  const maxItemsPerHero = requireInteger(raw.max_items_per_hero, "roster.max_items_per_hero", 1);
  const maxUniquePerTeam = requireInteger(raw.max_unique_per_team, "roster.max_unique_per_team", 1);
  if (maxUniquePerTeam > maxItemsPerHero) throw new Error("roster.max_unique_per_team must not exceed max_items_per_hero");
  return Object.freeze({ benchSlots, maxItemsPerHero, maxUniquePerTeam });
}

function compileProgression(value: unknown, playerBoardCells: number): ProgressionRules {
  const raw = requireRecord(value, "progression");
  const initialLevel = requireInteger(raw.initial_level, "progression.initial_level", 1);
  const maxLevel = requireInteger(raw.max_level, "progression.max_level", initialLevel);
  const xpPurchaseCost = requireInteger(raw.xp_purchase_cost, "progression.xp_purchase_cost", 1);
  const xpPerPurchase = requireInteger(raw.xp_per_purchase, "progression.xp_per_purchase", 1);
  const rawLevels = requireArray(raw.levels, "progression.levels");
  const expectedCount = maxLevel - initialLevel + 1;
  if (rawLevels.length !== expectedCount) throw new Error(`progression.levels must contain ${expectedCount} entries`);

  let previousBoardCap = 0;
  const levels = rawLevels.map((valueAtLevel, index): ProgressionLevelRule => {
    const levelRaw = requireRecord(valueAtLevel, `progression.levels[${index}]`);
    const expectedLevel = initialLevel + index;
    const level = requireInteger(levelRaw.level, `progression.levels[${index}].level`, initialLevel);
    if (level !== expectedLevel) throw new Error(`progression.levels[${index}].level must be ${expectedLevel}`);
    const xpToNext = requireInteger(levelRaw.xp_to_next, `progression.levels[${index}].xp_to_next`);
    if (level === maxLevel ? xpToNext !== 0 : xpToNext === 0) {
      throw new Error(level === maxLevel
        ? "maximum progression level must have xp_to_next 0"
        : "non-maximum progression levels must have positive xp_to_next");
    }
    const boardCap = requireInteger(levelRaw.board_cap, `progression.levels[${index}].board_cap`, 1);
    if (boardCap > playerBoardCells) throw new Error("board_cap exceeds player board cells");
    if (boardCap < previousBoardCap) throw new Error("progression board_cap must not decrease");
    previousBoardCap = boardCap;
    return Object.freeze({ level, xpToNext, boardCap });
  });

  return Object.freeze({
    initialLevel,
    maxLevel,
    xpPurchaseCost,
    xpPerPurchase,
    levels: Object.freeze(levels),
  });
}

function compileOdds(value: unknown, label: string): ShopOdds {
  const raw = requireArray(value, label);
  if (raw.length !== 5) throw new Error(`${label} must contain five rarity weights`);
  const weights = raw.map((weight, index) => requireInteger(weight, `${label}[${index}]`));
  if (weights.reduce((sum, weight) => sum + weight, 0) !== 100) throw new Error(`${label} must sum to 100`);
  return Object.freeze([weights[0]!, weights[1]!, weights[2]!, weights[3]!, weights[4]!]);
}

function compileShop(value: unknown, progression: ProgressionRules): ShopRules {
  const raw = requireRecord(value, "shop");
  const slotCount = requireInteger(raw.slot_count, "shop.slot_count", 1);
  const refreshCost = requireInteger(raw.refresh_cost, "shop.refresh_cost", 1);
  const copiesRaw = requireRecord(raw.copies_by_rarity, "shop.copies_by_rarity");
  const copiesByRarity = Object.freeze({
    1: requireInteger(copiesRaw["1"], "shop.copies_by_rarity.1", 1),
    2: requireInteger(copiesRaw["2"], "shop.copies_by_rarity.2", 1),
    3: requireInteger(copiesRaw["3"], "shop.copies_by_rarity.3", 1),
    4: requireInteger(copiesRaw["4"], "shop.copies_by_rarity.4", 1),
    5: requireInteger(copiesRaw["5"], "shop.copies_by_rarity.5", 1),
  }) satisfies Readonly<Record<HeroRarity, number>>;

  const oddsRaw = requireRecord(raw.odds_by_level, "shop.odds_by_level");
  const expectedLevelKeys = progression.levels.map((entry) => String(entry.level));
  const actualLevelKeys = Object.keys(oddsRaw).sort((left, right) => Number(left) - Number(right));
  if (actualLevelKeys.join(",") !== expectedLevelKeys.join(",")) {
    throw new Error(`shop.odds_by_level must define exactly levels ${expectedLevelKeys.join(",")}`);
  }
  const oddsByLevel: Record<number, ShopOdds> = {};
  for (const entry of progression.levels) {
    oddsByLevel[entry.level] = compileOdds(oddsRaw[String(entry.level)], `shop.odds_by_level.${entry.level}`);
  }

  return Object.freeze({ slotCount, refreshCost, copiesByRarity, oddsByLevel: Object.freeze(oddsByLevel) });
}

function compileAdventure(value: unknown): AdventureRules {
  const raw = requireRecord(value, "adventure");
  const roundCount = requireInteger(raw.round_count, "adventure.round_count", 1);
  const uniqueRevealRound = requireInteger(raw.unique_reveal_round, "adventure.unique_reveal_round", 1);
  if (uniqueRevealRound > roundCount) throw new Error("adventure.unique_reveal_round must be within the run");
  return Object.freeze({
    initialHealth: requireInteger(raw.initial_health, "adventure.initial_health", 1),
    initialGold: requireInteger(raw.initial_gold, "adventure.initial_gold"),
    baseRoundIncome: requireInteger(raw.base_round_income, "adventure.base_round_income"),
    roundCount,
    uniqueRevealRound,
  });
}

function compileStandard(value: unknown): StandardRules {
  const raw = requireRecord(value, "standard");
  return Object.freeze({
    initialHealth: requireInteger(raw.initial_health, "standard.initial_health", 1),
    initialGold: requireInteger(raw.initial_gold, "standard.initial_gold"),
    baseRoundIncome: requireInteger(raw.base_round_income, "standard.base_round_income"),
    interestStep: requireInteger(raw.interest_step, "standard.interest_step", 1),
    interestCap: requireInteger(raw.interest_cap, "standard.interest_cap"),
    streakBonusCap: requireInteger(raw.streak_bonus_cap, "standard.streak_bonus_cap"),
  });
}

/** Validates authored rules and returns an immutable, camel-cased runtime contract. */
export function compileRuleset(value: unknown): CompiledRuleset {
  const raw = requireRecord(value, "ruleset");
  const version = requireString(raw.version, "ruleset.version");
  const combat = compileCombat(raw.combat);
  const board = compileBoard(raw.board);
  const playerBoardCells = (board.playerRows.end - board.playerRows.start + 1) * board.columns;
  const roster = compileRoster(raw.roster);
  const progression = compileProgression(raw.progression, playerBoardCells);
  const shop = compileShop(raw.shop, progression);
  const adventure = compileAdventure(raw.adventure);
  const standard = compileStandard(raw.standard);

  const canonical = { version, combat, board, roster, shop, progression, adventure, standard };
  return Object.freeze({ ...canonical, rulesetHash: sha256Hex(canonical) });
}
