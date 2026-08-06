import type { CompiledRuleset } from "../rules/types.js";
import { assertAdventureRoster, freezeAdventureRoster, locateAdventureHero } from "./roster.js";
import type { AdventureHeroInstance, AdventureItemInstance, AdventureRoster } from "./types.js";

type SellRulesContract = Pick<CompiledRuleset, "board" | "roster">;

export interface SellAdventureHeroResult {
  readonly roster: AdventureRoster;
  readonly sold: AdventureHeroInstance;
  readonly goldValue: number;
}

function returnEquippedItem(item: AdventureItemInstance, heroInstanceId: string): AdventureItemInstance {
  if (item.equippedHeroInstanceId !== heroInstanceId) return item;
  const { equippedHeroInstanceId: _equippedHeroInstanceId, ...returned } = item;
  return Object.freeze(returned);
}

/**
 * Removes a hero, returns its equipped items to inventory, and reports the
 * represented shared-pool copies. Pool mutation is deliberately handled by the
 * shop domain so this function remains roster-only.
 */
export function sellAdventureHero(
  rules: SellRulesContract,
  roster: AdventureRoster,
  boardCap: number,
  heroInstanceId: string,
): SellAdventureHeroResult {
  assertAdventureRoster(rules, roster, boardCap);
  const located = locateAdventureHero(roster, heroInstanceId);
  if (located === undefined) throw new Error(`Adventure hero not found: ${heroInstanceId}`);

  const board = [...roster.board];
  const bench = [...roster.bench];
  if (located.kind === "board") board[located.index] = null;
  else bench[located.index] = null;
  const nextRoster = freezeAdventureRoster({
    board,
    bench,
    items: roster.items.map((item) => returnEquippedItem(item, heroInstanceId)),
  });
  assertAdventureRoster(rules, nextRoster, boardCap);

  return Object.freeze({
    roster: nextRoster,
    sold: located.hero,
    goldValue: located.hero.cost * located.hero.poolCopies,
  });
}
