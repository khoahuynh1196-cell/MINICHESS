import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  compileRuleset,
  createEmptyAdventureRoster,
  equipAdventureItem,
  freezeAdventureRoster,
  grantAdventureItem,
  unequipAdventureItem,
  type AdventureHeroInstance,
  type AdventureRoster,
} from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

const holder: AdventureHeroInstance = Object.freeze({
  instanceId: "hero-holder",
  heroId: "H01",
  cost: 1,
  stars: 1,
  poolCopies: 1,
  acquisitionOrder: 1,
});

function rosterWithHolder(items: AdventureRoster["items"] = []): AdventureRoster {
  const empty = createEmptyAdventureRoster(rules);
  const board = [...empty.board];
  board[0] = holder;
  return freezeAdventureRoster({ board, bench: empty.bench, items });
}

describe("pure Adventure item rules", () => {
  it("grants an unequipped normal item immutably", () => {
    const original = rosterWithHolder();
    const granted = grantAdventureItem(rules, original, 3, {
      instanceId: "item-a", itemId: "I01", kind: "normal",
    });

    expect(granted.items).toEqual([{ instanceId: "item-a", itemId: "I01", kind: "normal" }]);
    expect(original.items).toEqual([]);
  });

  it("equips and unequips an item without changing hero state", () => {
    const granted = grantAdventureItem(rules, rosterWithHolder(), 3, {
      instanceId: "item-a", itemId: "I01", kind: "normal",
    });
    const equipped = equipAdventureItem(rules, granted, 3, "item-a", holder.instanceId);
    const unequipped = unequipAdventureItem(rules, equipped, 3, "item-a");

    expect(equipped.items[0]).toEqual({
      instanceId: "item-a", itemId: "I01", kind: "normal", equippedHeroInstanceId: holder.instanceId,
    });
    expect(unequipped.items[0]).toEqual({ instanceId: "item-a", itemId: "I01", kind: "normal" });
    expect(equipped.board[0]).toEqual(holder);
  });

  it("enforces two items per hero", () => {
    const roster = rosterWithHolder([
      { instanceId: "item-1", itemId: "I01", kind: "normal", equippedHeroInstanceId: holder.instanceId },
      { instanceId: "item-2", itemId: "I02", kind: "normal", equippedHeroInstanceId: holder.instanceId },
      { instanceId: "item-3", itemId: "I03", kind: "normal" },
    ]);

    expect(() => equipAdventureItem(rules, roster, 3, "item-3", holder.instanceId))
      .toThrow(`Hero ${holder.instanceId} exceeds item capacity`);
  });

  it("allows only one Unique item in the team", () => {
    const first = grantAdventureItem(rules, rosterWithHolder(), 3, {
      instanceId: "unique-1", itemId: "U01", kind: "unique",
    });

    expect(() => grantAdventureItem(rules, first, 3, {
      instanceId: "unique-2", itemId: "U02", kind: "unique",
    })).toThrow("Adventure roster exceeds Unique capacity");
  });

  it("rejects duplicate grants, missing holders, and invalid unequip operations", () => {
    const granted = grantAdventureItem(rules, rosterWithHolder(), 3, {
      instanceId: "item-a", itemId: "I01", kind: "normal",
    });

    expect(() => grantAdventureItem(rules, granted, 3, {
      instanceId: "item-a", itemId: "I02", kind: "normal",
    })).toThrow("Duplicate item instance: item-a");
    expect(() => equipAdventureItem(rules, granted, 3, "item-a", "missing"))
      .toThrow("Adventure hero not found: missing");
    expect(() => unequipAdventureItem(rules, granted, 3, "item-a"))
      .toThrow("Adventure item is not equipped: item-a");
  });
});
