import type { CompiledRuleset } from "../rules/types.js";
import { assertAdventureRoster, freezeAdventureRoster, locateAdventureHero } from "./roster.js";
import type { AdventureItemInstance, AdventureRoster } from "./types.js";

type ItemRulesContract = Pick<CompiledRuleset, "board" | "roster">;

function withoutEquipment(item: AdventureItemInstance): AdventureItemInstance {
  const { equippedHeroInstanceId: _equippedHeroInstanceId, ...unequipped } = item;
  return Object.freeze(unequipped);
}

export function grantAdventureItem(
  rules: ItemRulesContract,
  roster: AdventureRoster,
  boardCap: number,
  item: AdventureItemInstance,
): AdventureRoster {
  assertAdventureRoster(rules, roster, boardCap);
  if (item.equippedHeroInstanceId !== undefined) throw new Error("Granted Adventure item must start unequipped");
  if (roster.items.some((candidate) => candidate.instanceId === item.instanceId)) {
    throw new Error(`Duplicate item instance: ${item.instanceId}`);
  }
  const granted = freezeAdventureRoster({ ...roster, items: [...roster.items, item] });
  assertAdventureRoster(rules, granted, boardCap);
  return granted;
}

export function equipAdventureItem(
  rules: ItemRulesContract,
  roster: AdventureRoster,
  boardCap: number,
  itemInstanceId: string,
  heroInstanceId: string,
): AdventureRoster {
  assertAdventureRoster(rules, roster, boardCap);
  const item = roster.items.find((candidate) => candidate.instanceId === itemInstanceId);
  if (item === undefined) throw new Error(`Adventure item not found: ${itemInstanceId}`);
  if (item.equippedHeroInstanceId !== undefined) throw new Error(`Adventure item is already equipped: ${itemInstanceId}`);
  if (locateAdventureHero(roster, heroInstanceId) === undefined) throw new Error(`Adventure hero not found: ${heroInstanceId}`);

  const equippedItems = roster.items.filter((candidate) => candidate.equippedHeroInstanceId === heroInstanceId);
  if (equippedItems.length >= rules.roster.maxItemsPerHero) throw new Error(`Hero ${heroInstanceId} exceeds item capacity`);
  if (item.kind === "unique" && equippedItems.some((candidate) => candidate.kind === "unique")) {
    throw new Error(`Hero ${heroInstanceId} already carries a Unique`);
  }

  const equipped = freezeAdventureRoster({
    ...roster,
    items: roster.items.map((candidate) => candidate.instanceId === itemInstanceId
      ? Object.freeze({ ...candidate, equippedHeroInstanceId: heroInstanceId })
      : candidate),
  });
  assertAdventureRoster(rules, equipped, boardCap);
  return equipped;
}

export function unequipAdventureItem(
  rules: ItemRulesContract,
  roster: AdventureRoster,
  boardCap: number,
  itemInstanceId: string,
): AdventureRoster {
  assertAdventureRoster(rules, roster, boardCap);
  const item = roster.items.find((candidate) => candidate.instanceId === itemInstanceId);
  if (item === undefined) throw new Error(`Adventure item not found: ${itemInstanceId}`);
  if (item.equippedHeroInstanceId === undefined) throw new Error(`Adventure item is not equipped: ${itemInstanceId}`);

  const unequipped = freezeAdventureRoster({
    ...roster,
    items: roster.items.map((candidate) => candidate.instanceId === itemInstanceId
      ? withoutEquipment(candidate)
      : candidate),
  });
  assertAdventureRoster(rules, unequipped, boardCap);
  return unequipped;
}
