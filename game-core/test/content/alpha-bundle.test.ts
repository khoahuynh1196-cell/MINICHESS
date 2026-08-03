import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle } from "../../src/index.js";

const bundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const heroIds = Array.from({ length: 20 }, (_value, index) => `H${String(index + 1).padStart(2, "0")}`);

function countBy(values: readonly { species_trait_id: string; class_trait_id: string }[], key: "species_trait_id" | "class_trait_id"): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value[key]]: (counts[value[key]] ?? 0) + 1 }), {});
}

describe("Alpha content bundle", () => {
  it("contains the approved twenty-hero species and class distribution", () => {
    expect(existsSync(bundlePath)).toBe(true);
    if (!existsSync(bundlePath)) return;

    const raw = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      heroes: Array<{ id: string; species_trait_id: string; class_trait_id: string }>;
    };
    const compiled = compileContentBundle(raw);

    expect([...compiled.heroesById.keys()].sort()).toEqual(heroIds);
    expect(countBy(raw.heroes, "species_trait_id")).toEqual({ R_CAT: 5, R_DOG: 5, R_RABBIT: 4, R_COW: 3, R_EXOTIC: 3 });
    expect(countBy(raw.heroes, "class_trait_id")).toEqual({ C_GUARDIAN: 4, C_FIGHTER: 4, C_RANGER: 4, C_MAGE: 4, C_SUPPORT: 4 });
  });

  it("exposes the approved item inventory and round-four Unique reveal", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const inventory = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));

    expect(inventory.normalItems.map((item) => item.id)).toEqual([
      "I01", "I02", "I03", "I04", "I05", "I06", "I07", "I08", "I09", "I10", "I11", "I12",
    ]);
    expect(inventory.uniqueItems.map((item) => item.id)).toEqual(["U01", "U02", "U03", "U04", "U05", "U06"]);
    expect(inventory.transformations.map((transformation) => transformation.id)).toEqual([
      "VT_U01", "VT_U02", "VT_U03", "VT_U04", "VT_U05", "VT_U06",
    ]);
    expect(inventory.encounters.map((encounter) => encounter.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(inventory.encounters
      .filter((encounter) => encounter.rewards.some((reward) => reward.kind === "unique_reveal"))
      .map((encounter) => encounter.round)).toEqual([4]);
  });

  it("compiles every Alpha item and Unique trigger into canonical passive data", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const inventory = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    expect(inventory.normalItems.map((item) => item.triggers.map((trigger) => trigger.trigger))).toEqual([
      [], [], [], [], [], [], [], [], ["on_damage_dealt"], ["on_combat_start"], ["on_cast_resolve"], ["on_basic_attack"],
    ]);
    expect(inventory.uniqueItems.map((item) => item.triggers.map((trigger) => trigger.trigger))).toEqual([
      ["on_hp_below"], ["on_every_nth_basic_attack"], ["on_combat_start"], ["on_cast_resolve"], ["on_cast_resolve"], ["on_hp_below"],
    ]);
    expect(inventory.normalItems[8]?.triggers[0]).toMatchObject({ basicOnly: true, lifestealPerThousand: 150 });
    expect(inventory.uniqueItems[1]?.triggers[0]).toMatchObject({ attackCount: 3 });
    expect(inventory.uniqueItems[2]?.triggers[0]?.effects[0]).toMatchObject({ scalesWithMaxHp: true });
  });

  it("ships eight validated enemy formations with the approved difficulty progression", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const inventory = compileContentBundle(JSON.parse(readFileSync(bundlePath, "utf8")));
    expect(inventory.encounters.map((encounter) => encounter.enemy_composition?.length)).toEqual([2, 3, 3, 4, 4, 5, 5, 6]);
    expect(inventory.encounters.map((encounter) => encounter.enemy_composition?.[0]?.stat_multiplier)).toEqual([550, 700, 900, 1100, 1200, 1350, 1550, 1800]);
    for (const encounter of inventory.encounters) {
      const positions = encounter.enemy_composition?.map((enemy) => enemy.position) ?? [];
      expect(new Set(positions).size).toBe(positions.length);
      expect(positions.every((position) => position >= 0 && position <= 11)).toBe(true);
    }
    expect(inventory.encounters.filter((encounter) => encounter.affix !== undefined).map((encounter) => encounter.round)).toEqual([5]);
    expect(inventory.encounters.find((encounter) => encounter.round === 5)?.affix).toEqual({ kind: "attack_speed_multiplier", value: 150 });
  });

  it("rejects a Unique item whose transformation is not in the bundle", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const invalid = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      unique_items: unknown[];
    };
    invalid.unique_items = [{
      id: "U01",
      kind: "unique",
      display_key: "item.u01.name",
      slot_cost: 1,
      stat_modifiers: [],
      visual_transformation_id: "VT_MISSING",
      suggested_holder_tags: ["guardian", "fighter", "mage"],
    }];

    expect(() => compileContentBundle(invalid)).toThrow(/U01.*VT_MISSING/);
  });

  it("matches the locked publish schema for display, equipment and visual transformation data", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const raw = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      heroes: Array<{ display_key?: string }>;
      traits: Array<{ kind?: string; breakpoints?: Array<{ count?: number; effects?: unknown[] }> }>;
      visual_profiles: Array<{ sprite_key?: string; portrait_key?: string }>;
      normal_items: Array<{ kind?: string; display_key?: string; slot_cost?: number; stat_modifiers?: unknown[] }>;
      unique_items: Array<{ kind?: string; display_key?: string; slot_cost?: number; visual_transformation_id?: string; suggested_holder_tags?: string[] }>;
      transformations: Array<{ id: string; accessory_key?: string; accessory_anchor?: string; aura_key?: string; vfx_key?: string; icon_key?: string; portrait_badge_key?: string }>;
    };

    expect(raw.heroes.every((hero) => hero.display_key?.startsWith("hero."))).toBe(true);
    expect(raw.traits.every((trait) => (trait.kind === "species" || trait.kind === "class") && trait.breakpoints?.every((breakpoint) => Number.isSafeInteger(breakpoint.count) && Array.isArray(breakpoint.effects)))).toBe(true);
    expect(raw.visual_profiles.every((profile) => profile.sprite_key?.length && profile.portrait_key?.length)).toBe(true);
    expect(raw.normal_items.every((item) => item.kind === "normal" && item.display_key?.startsWith("item.") && item.slot_cost === 1 && Array.isArray(item.stat_modifiers))).toBe(true);
    expect(raw.unique_items.every((item) => item.kind === "unique" && item.display_key?.startsWith("item.") && item.slot_cost === 1 && item.visual_transformation_id?.startsWith("VT_") && (item.suggested_holder_tags?.length ?? 0) >= 3)).toBe(true);
    expect(raw.transformations.map((transformation) => transformation.id)).toEqual(["VT_U01", "VT_U02", "VT_U03", "VT_U04", "VT_U05", "VT_U06"]);
    expect(raw.transformations.every((transformation) => transformation.accessory_key?.length && transformation.accessory_anchor?.length && transformation.aura_key?.length && transformation.vfx_key?.length && transformation.icon_key?.length && transformation.portrait_badge_key?.length)).toBe(true);
  });
});
