import { sha256Hex } from "../serialization/canonical-json.js";
import type {
  BoardGeometry,
  CompiledRuleset,
  ProgressionLevelRule,
  RulesetRarity,
  ShopOddsTuple,
} from "./types.js";

const EXPECTED_LEVELS = [3, 4, 5, 6, 7, 8, 9] as const;
const RARITIES = [1, 2, 3, 4, 5] as const;

function requireRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requireExactKeys(record: Record<string, unknown>, label: string, keys: readonly string[]): void {
  const expected = new Set(keys);
  const unexpected = Object.keys(record).filter((key) => !expected.has(key));
  const missing = keys.filter((key) => !Object.hasOwn(record, key));
  if (missing.length > 0) throw new Error(`${label} is missing ${missing[0]}`);
  if (unexpected.length > 0) throw new Error(`${label} contains unsupported field ${unexpected[0]}`);
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}

function requireInteger(value: unknown, label: string, minimum: number): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer >= ${minimum}`);
  }
  return value;
}

function requireTuple5(value: unknown, label: string): ShopOddsTuple {
  if (!Array.isArray(value) || value.length !== 5) {
    throw new Error(`${label} must contain five odds`);
  }
  const values = value.map((entry, index) => requireInteger(entry, `${label}[${index}]`, 0));
  return values as unknown as ShopOddsTuple;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  return Object.freeze(value);
}

function requireRowRange(value: unknown, label: string, rows: number): Readonly<{ start: number; end: number }> {
  const range = requireRecord(value, label);
  requireExactKeys(range, label, ["start", "end"]);
  const start = requireInteger(range.start, `${label}.start`, 0);
  const end = requireInteger(range.end, `${label}.end`, 0);
  if (start > end) throw new Error(`${label}.start must be <= ${label}.end`);
  if (end >= rows) throw new Error(`${label} must stay inside board rows`);
  return { start, end };
}

function compileBoard(value: unknown): BoardGeometry {
  const raw = requireRecord(value, "board");
  requireExactKeys(raw, "board", ["columns", "rows", "enemy_rows", "player_rows", "movement"]);
  const columns = requireInteger(raw.columns, "board.columns", 1);
  const rows = requireInteger(raw.rows, "board.rows", 1);
  if (columns !== 4 || rows !== 8) throw new Error("production board must be 4 columns x 8 rows");
  const enemyRows = requireRowRange(raw.enemy_rows, "board.enemy_rows", rows);
  const playerRows = requireRowRange(raw.player_rows, "board.player_rows", rows);
  if (enemyRows.start <= playerRows.end && playerRows.start <= enemyRows.end) {
    throw new Error("board side rows must not overlap");
  }
  if (enemyRows.end - enemyRows.start + 1 !== 4 || playerRows.end - playerRows.start + 1 !== 4) {
    throw new Error("board sides must each contain four rows");
  }
  if (enemyRows.start !== 0 || enemyRows.end + 1 !== playerRows.start || playerRows.end !== rows - 1) {
    throw new Error("board side rows must partition the board");
  }
  if (raw.movement !== "orthogonal") throw new Error("board.movement must be orthogonal");
  return { columns, rows, enemyRows, playerRows, movement: "orthogonal" };
}

function compileRoster(value: unknown): CompiledRuleset["roster"] {
  const raw = requireRecord(value, "roster");
  requireExactKeys(raw, "roster", ["bench_slots", "max_items_per_hero", "max_unique_per_team"]);
  const benchSlots = requireInteger(raw.bench_slots, "roster.bench_slots", 1);
  const maxItemsPerHero = requireInteger(raw.max_items_per_hero, "roster.max_items_per_hero", 1);
  const maxUniquePerTeam = requireInteger(raw.max_unique_per_team, "roster.max_unique_per_team", 1);
  if (benchSlots !== 8) throw new Error("roster.bench_slots must be 8");
  if (maxItemsPerHero !== 2) throw new Error("roster.max_items_per_hero must be 2");
  if (maxUniquePerTeam !== 1) throw new Error("roster.max_unique_per_team must be 1");
  return { benchSlots, maxItemsPerHero, maxUniquePerTeam };
}

function compileCopiesByRarity(value: unknown): Readonly<Record<RulesetRarity, number>> {
  const raw = requireRecord(value, "shop.copies_by_rarity");
  requireExactKeys(raw, "shop.copies_by_rarity", RARITIES.map(String));
  return {
    1: requireInteger(raw["1"], "shop.copies_by_rarity.1", 1),
    2: requireInteger(raw["2"], "shop.copies_by_rarity.2", 1),
    3: requireInteger(raw["3"], "shop.copies_by_rarity.3", 1),
    4: requireInteger(raw["4"], "shop.copies_by_rarity.4", 1),
    5: requireInteger(raw["5"], "shop.copies_by_rarity.5", 1),
  };
}

function compileOddsByLevel(value: unknown): Readonly<Record<number, ShopOddsTuple>> {
  const raw = requireRecord(value, "shop.odds_by_level");
  requireExactKeys(raw, "shop.odds_by_level", EXPECTED_LEVELS.map(String));
  const entries = EXPECTED_LEVELS.map((level) => {
    const odds = requireTuple5(raw[String(level)], `shop.odds_by_level.${level}`);
    if (odds.reduce((total, entry) => total + entry, 0) !== 100) {
      throw new Error(`shop.odds_by_level.${level} must sum to 100`);
    }
    return [level, odds] as const;
  });
  return Object.fromEntries(entries) as Readonly<Record<number, ShopOddsTuple>>;
}

function compileShop(value: unknown): CompiledRuleset["shop"] {
  const raw = requireRecord(value, "shop");
  requireExactKeys(raw, "shop", ["slot_count", "refresh_cost", "copies_by_rarity", "odds_by_level"]);
  const slotCount = requireInteger(raw.slot_count, "shop.slot_count", 1);
  const refreshCost = requireInteger(raw.refresh_cost, "shop.refresh_cost", 1);
  if (slotCount !== 5) throw new Error("shop.slot_count must be 5");
  return {
    slotCount,
    refreshCost,
    copiesByRarity: compileCopiesByRarity(raw.copies_by_rarity),
    oddsByLevel: compileOddsByLevel(raw.odds_by_level),
  };
}

function compileProgression(value: unknown, playerBoardCells: number): CompiledRuleset["progression"] {
  const raw = requireRecord(value, "progression");
  requireExactKeys(raw, "progression", ["initial_level", "max_level", "xp_purchase_cost", "xp_per_purchase", "levels"]);
  const initialLevel = requireInteger(raw.initial_level, "progression.initial_level", 1);
  const maxLevel = requireInteger(raw.max_level, "progression.max_level", initialLevel);
  const xpPurchaseCost = requireInteger(raw.xp_purchase_cost, "progression.xp_purchase_cost", 1);
  const xpPerPurchase = requireInteger(raw.xp_per_purchase, "progression.xp_per_purchase", 1);
  if (initialLevel !== EXPECTED_LEVELS[0] || maxLevel !== EXPECTED_LEVELS.at(-1)) {
    throw new Error("progression levels must span 3 through 9");
  }
  const levelValues = raw.levels;
  if (!Array.isArray(levelValues) || levelValues.length !== EXPECTED_LEVELS.length) {
    throw new Error("progression.levels must contain levels 3 through 9");
  }
  let previousBoardCap = 0;
  const levels: ProgressionLevelRule[] = levelValues.map((valueForLevel, index) => {
    const label = `progression.levels[${index}]`;
    const levelRaw = requireRecord(valueForLevel, label);
    requireExactKeys(levelRaw, label, ["level", "xp_to_next", "board_cap"]);
    const level = requireInteger(levelRaw.level, `${label}.level`, initialLevel);
    const xpToNext = requireInteger(levelRaw.xp_to_next, `${label}.xp_to_next`, 0);
    const boardCap = requireInteger(levelRaw.board_cap, `${label}.board_cap`, 1);
    if (level !== EXPECTED_LEVELS[index]) throw new Error("progression levels must be contiguous from 3 through 9");
    if (index === levelValues.length - 1 ? xpToNext !== 0 : xpToNext <= 0) {
      throw new Error(index === levelValues.length - 1
        ? "final progression level must have xp_to_next 0"
        : "non-final progression levels require positive xp_to_next");
    }
    if (boardCap < previousBoardCap) throw new Error("progression board_cap must not decrease");
    if (boardCap > playerBoardCells) throw new Error("board_cap exceeds player board cells");
    if (boardCap > 8) throw new Error("board_cap exceeds launch deployment cap");
    previousBoardCap = boardCap;
    return { level, xpToNext, boardCap };
  });
  return { initialLevel, maxLevel, xpPurchaseCost, xpPerPurchase, levels };
}

function compileAdventure(value: unknown): CompiledRuleset["adventure"] {
  const raw = requireRecord(value, "adventure");
  requireExactKeys(raw, "adventure", ["initial_health", "initial_gold", "base_round_income", "round_count", "unique_reveal_round", "loss_damage"]);
  const initialHealth = requireInteger(raw.initial_health, "adventure.initial_health", 1);
  const initialGold = requireInteger(raw.initial_gold, "adventure.initial_gold", 0);
  const baseRoundIncome = requireInteger(raw.base_round_income, "adventure.base_round_income", 0);
  const roundCount = requireInteger(raw.round_count, "adventure.round_count", 1);
  const uniqueRevealRound = requireInteger(raw.unique_reveal_round, "adventure.unique_reveal_round", 1);
  if (uniqueRevealRound > roundCount) throw new Error("adventure.unique_reveal_round must be within the run");
  const lossRaw = requireRecord(raw.loss_damage, "adventure.loss_damage");
  requireExactKeys(lossRaw, "adventure.loss_damage", ["base", "per_survivor", "cap"]);
  const lossDamage = {
    base: requireInteger(lossRaw.base, "adventure.loss_damage.base", 0),
    perSurvivor: requireInteger(lossRaw.per_survivor, "adventure.loss_damage.per_survivor", 0),
    cap: requireInteger(lossRaw.cap, "adventure.loss_damage.cap", 1),
  };
  if (lossDamage.cap < lossDamage.base) throw new Error("adventure.loss_damage.cap must cover base damage");
  return { initialHealth, initialGold, baseRoundIncome, roundCount, uniqueRevealRound, lossDamage };
}

function compileStandard(value: unknown): CompiledRuleset["standard"] {
  const raw = requireRecord(value, "standard");
  requireExactKeys(raw, "standard", [
    "initial_health",
    "initial_gold",
    "base_round_income",
    "interest_threshold",
    "interest_per_threshold",
    "interest_cap",
    "streak_bonus_cap",
    "planning_seconds_early",
    "planning_seconds_late",
  ]);
  return {
    initialHealth: requireInteger(raw.initial_health, "standard.initial_health", 1),
    initialGold: requireInteger(raw.initial_gold, "standard.initial_gold", 0),
    baseRoundIncome: requireInteger(raw.base_round_income, "standard.base_round_income", 0),
    interestThreshold: requireInteger(raw.interest_threshold, "standard.interest_threshold", 1),
    interestPerThreshold: requireInteger(raw.interest_per_threshold, "standard.interest_per_threshold", 1),
    interestCap: requireInteger(raw.interest_cap, "standard.interest_cap", 0),
    streakBonusCap: requireInteger(raw.streak_bonus_cap, "standard.streak_bonus_cap", 0),
    planningSecondsEarly: requireInteger(raw.planning_seconds_early, "standard.planning_seconds_early", 1),
    planningSecondsLate: requireInteger(raw.planning_seconds_late, "standard.planning_seconds_late", 1),
  };
}

export function compileRuleset(raw: unknown): CompiledRuleset {
  const root = requireRecord(raw, "ruleset");
  requireExactKeys(root, "ruleset", ["version", "tick_rate", "max_combat_ticks", "board", "roster", "shop", "progression", "adventure", "standard"]);
  const version = requireString(root.version, "version");
  const tickRate = requireInteger(root.tick_rate, "tick_rate", 1);
  const maxCombatTicks = requireInteger(root.max_combat_ticks, "max_combat_ticks", 1);
  const board = compileBoard(root.board);
  const playerBoardCells = board.columns * (board.playerRows.end - board.playerRows.start + 1);
  const normalized = {
    version,
    tickRate,
    maxCombatTicks,
    board,
    roster: compileRoster(root.roster),
    shop: compileShop(root.shop),
    progression: compileProgression(root.progression, playerBoardCells),
    adventure: compileAdventure(root.adventure),
    standard: compileStandard(root.standard),
  };
  return deepFreeze({ ...normalized, rulesetHash: sha256Hex(normalized) });
}
