import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { compileContentBundle } from "../../src/index.js";

const bundlePath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const assetManifestPath = fileURLToPath(new URL("../../../client-godot/assets/asset_manifest.json", import.meta.url));
const heroIds = Array.from({ length: 20 }, (_value, index) => `H${String(index + 1).padStart(2, "0")}`);
const requiredSkillPrimitives = [
  "deal_damage", "heal", "shield", "stun", "slow", "buff_stat", "debuff_stat", "summon", "cleanse", "dash", "knockback",
] as const;

function countBy(values: readonly { species_trait_id: string; class_trait_id: string }[], key: "species_trait_id" | "class_trait_id"): Record<string, number> {
  return values.reduce<Record<string, number>>((counts, value) => ({ ...counts, [value[key]]: (counts[value[key]] ?? 0) + 1 }), {});
}

describe("Alpha content bundle", () => {
  it("registers every bundle visual, item, biome, and Unique transformation in the asset manifest", () => {
    expect(existsSync(assetManifestPath)).toBe(true);
    if (!existsSync(assetManifestPath) || !existsSync(bundlePath)) return;

    const bundle = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      visual_profiles: Array<{ id: string; portrait_key: string; sprite_key: string; ability_icon_key: string; vfx_key: string; animations: string[] }>;
      normal_items: Array<{ id: string }>;
      unique_items: Array<{ id: string; visual_transformation_id: string }>;
      transformations: Array<{ id: string; accessory_key: string; aura_key: string; vfx_key: string; icon_key: string; portrait_badge_key: string }>;
      encounters: Array<{ biome: string }>;
    };
    const manifest = JSON.parse(readFileSync(assetManifestPath, "utf8")) as {
      assets: Record<string, { path: string; frames?: Array<{ x: number; y: number; width: number; height: number }> }>;
      visual_profiles: Record<string, { portrait: string; sprite: string; icon: string; vfx: string; animation_mode: string; animations: Record<string, string> }>;
      items: Record<string, { icon: string; badge?: string }>;
      biomes: Record<string, { layers: string[] }>;
      transformations: Record<string, { accessory: string; aura: string; vfx: string; icon: string; portrait_badge: string }>;
    };
    const hasAsset = (key: string) => Boolean(manifest.assets[key]?.path);

    for (const profile of bundle.visual_profiles) {
      const entry = manifest.visual_profiles[profile.id];
      expect(entry, `missing visual profile ${profile.id}`).toBeTruthy();
      expect([entry?.portrait, entry?.sprite, entry?.icon, entry?.vfx].every((key) => Boolean(key && hasAsset(key)))).toBe(true);
      expect([profile.portrait_key, profile.sprite_key, profile.ability_icon_key, profile.vfx_key].every(hasAsset)).toBe(true);
      expect(entry?.animation_mode).toBe("rig_transform_static_pose");
      expect(Object.keys(entry?.animations ?? {}).sort()).toEqual([...profile.animations].sort());
      expect(Object.values(entry?.animations ?? {}).every((key) => (manifest.assets[key]?.frames?.length ?? 0) === 1)).toBe(true);
    }

    for (const item of [...bundle.normal_items, ...bundle.unique_items]) {
      expect(hasAsset(manifest.items[item.id]?.icon ?? ""), `missing item icon ${item.id}`).toBe(true);
    }
    for (const biome of new Set(bundle.encounters.map((encounter) => encounter.biome))) {
      const layers = manifest.biomes[biome]?.layers ?? [];
      expect(layers.length, `missing biome layers ${biome}`).toBeGreaterThan(0);
      expect(layers.every(hasAsset)).toBe(true);
    }
    for (const transformation of bundle.transformations) {
      const entry = manifest.transformations[transformation.id];
      expect(entry, `missing Unique transformation ${transformation.id}`).toBeTruthy();
      expect([entry?.accessory, entry?.aura, entry?.vfx, entry?.icon, entry?.portrait_badge].every((key) => Boolean(key && hasAsset(key)))).toBe(true);
      expect(entry).toMatchObject({
        accessory: transformation.accessory_key,
        aura: transformation.aura_key,
        vfx: transformation.vfx_key,
        icon: transformation.icon_key,
        portrait_badge: transformation.portrait_badge_key,
      });
    }
  });

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

  it("ships H01 through H20 as shop-eligible heroes with complete PvE metadata", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const raw = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      heroes: Array<{
        id: string;
        display_key?: string;
        species_trait_id?: string;
        class_trait_id?: string;
        rarity?: number;
        cost?: number;
        tags?: string[];
        is_unique_hero?: boolean;
        base_stats?: Record<string, number>;
        star_multipliers?: { two?: Record<string, number>; three?: Record<string, number> };
        skill_id?: string;
        visual_profile_id?: string;
      }>;
      traits: Array<{ id: string; kind?: string }>;
      visual_profiles: Array<{ id: string; ability_icon_key?: string; vfx_key?: string }>;
      encounters: Array<{ biome?: string; kind?: string }>;
    };
    const compiled = compileContentBundle(raw);

    expect(compiled.manifest).toMatchObject({ heroCount: 20, shopHeroCount: 20, uniqueHeroCount: 0 });
    expect(raw.heroes.map((hero) => hero.id).sort()).toEqual(heroIds);
    expect(raw.heroes.every((hero) => hero.display_key?.startsWith("hero.") && hero.species_trait_id && hero.class_trait_id && hero.rarity !== undefined && hero.cost !== undefined && hero.tags?.length && hero.is_unique_hero === false && hero.base_stats && hero.star_multipliers?.two && hero.star_multipliers.three && hero.skill_id && hero.visual_profile_id)).toBe(true);
    expect(raw.traits.filter((trait) => trait.kind === "species")).toHaveLength(5);
    expect(raw.traits.filter((trait) => trait.kind === "class")).toHaveLength(5);
    expect(raw.visual_profiles).toHaveLength(20);
    expect(raw.visual_profiles.every((profile) => profile.ability_icon_key?.length && profile.vfx_key?.length)).toBe(true);
    expect(raw.encounters).toHaveLength(8);
    expect(raw.encounters.every((encounter) => encounter.biome?.length && encounter.kind?.length)).toBe(true);
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

  it("ships readable skills with every required PvE effect primitive", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const raw = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      skills: Array<{ id: string; name?: string; target_policy?: string; effects: Array<{ primitive: string }> }>;
    };

    expect(raw.skills.map((skill) => skill.id)).toEqual(heroIds.map((heroId) => `S_${heroId}`));
    expect(raw.skills.every((skill) => skill.name?.length && skill.target_policy?.length && skill.effects.length > 0)).toBe(true);
    const primitives = new Set(raw.skills.flatMap((skill) => skill.effects.map((effect) => effect.primitive)));
    expect(requiredSkillPrimitives.every((primitive) => primitives.has(primitive))).toBe(true);
  });

  it("keeps item effects, visual profiles, and Unique transformations bundle-defined", () => {
    if (!existsSync(bundlePath)) throw new Error("Alpha bundle fixture is missing");

    const raw = JSON.parse(readFileSync(bundlePath, "utf8")) as {
      heroes: Array<{ visual_profile_id: string }>;
      visual_profiles: Array<{ id: string }>;
      normal_items: Array<{ category?: string; triggers?: Array<{ effects?: Array<{ primitive: string }> }>; rules?: Array<{ effects?: Array<{ primitive: string }> }> }>;
      unique_items: Array<{ visual_transformation_id: string; triggers?: Array<{ effects?: Array<{ primitive: string }> }> }>;
      transformations: Array<{ id: string }>;
    };
    const knownPrimitives = new Set<string>([
      "deal_damage", "restore_mana", "damage_reduction", "heal", "shield", "stun", "slow", "buff_stat", "debuff_stat", "dash", "retreat", "knockback", "summon", "apply_dot", "cleanse",
    ]);
    const itemEffects = [...raw.normal_items, ...raw.unique_items]
      .flatMap((item) => [...(item.triggers ?? []), ...("rules" in item ? item.rules ?? [] : [])])
      .flatMap((trigger) => trigger.effects ?? []);

    expect(raw.normal_items.map((item) => item.category)).toEqual([
      "offensive", "offensive", "offensive", "offensive", "defensive", "defensive", "defensive", "defensive", "utility", "utility", "utility", "utility",
    ]);
    expect(itemEffects.every((effect) => knownPrimitives.has(effect.primitive))).toBe(true);
    expect(raw.heroes.every((hero) => raw.visual_profiles.some((profile) => profile.id === hero.visual_profile_id))).toBe(true);
    expect(raw.unique_items.every((item) => raw.transformations.some((transformation) => transformation.id === item.visual_transformation_id))).toBe(true);
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
    expect(inventory.encounters.map((encounter) => ({
      round: encounter.round,
      biome: encounter.biome,
      kind: encounter.kind,
    }))).toEqual([
      { round: 1, biome: "meadow", kind: "normal" },
      { round: 2, biome: "meadow", kind: "normal" },
      { round: 3, biome: "ruins", kind: "elite" },
      { round: 4, biome: "ruins", kind: "miniboss" },
      { round: 5, biome: "frost_keep", kind: "affix" },
      { round: 6, biome: "frost_keep", kind: "hard" },
      { round: 7, biome: "ember_citadel", kind: "elite" },
      { round: 8, biome: "ember_citadel", kind: "boss" },
    ]);
    expect(inventory.encounters.map((encounter) => encounter.enemy_composition?.length)).toEqual([2, 3, 3, 4, 4, 5, 5, 6]);
    expect(inventory.encounters.map((encounter) => encounter.enemy_composition?.[0]?.stat_multiplier)).toEqual([550, 700, 900, 1100, 1200, 1350, 1550, 1800]);
    for (const encounter of inventory.encounters) {
      const positions = encounter.enemy_composition?.map((enemy) => enemy.position) ?? [];
      expect(new Set(positions).size).toBe(positions.length);
      expect(positions.every((position) => position >= 0 && position <= 11)).toBe(true);
    }
    expect(inventory.encounters.filter((encounter) => encounter.affix !== undefined).map((encounter) => encounter.round)).toEqual([5]);
    expect(inventory.encounters.find((encounter) => encounter.round === 5)?.affix).toEqual({ kind: "attack_speed_multiplier", value: 150 });
    expect(inventory.encounters.find((encounter) => encounter.round === 4)?.rewards.map((reward) => reward.kind)).toEqual(["unique_reveal", "hero_choice"]);
    expect(inventory.encounters.find((encounter) => encounter.round === 8)?.rewards.map((reward) => reward.kind)).toEqual(["final_chest"]);
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
