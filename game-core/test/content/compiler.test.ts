import { describe, expect, it } from "vitest";

const compilerModulePath = "../../src/content/compiler.js";

const baseBundle = {
  version: "test",
  heroes: [{
    id: "H01",
    display_key: "hero.h01.name",
    species_trait_id: "R_CAT",
    class_trait_id: "C_GUARDIAN",
    cost: 1,
    rarity: 1,
    tags: ["guardian"],
    is_unique_hero: false,
    base_stats: {
      max_hp: 90_000,
      attack_damage: 5_000,
      attack_speed: 1_000,
      armor: 20_000,
      magic_resist: 20_000,
      attack_range: 1,
      move_speed: 1_000,
      starting_mana: 0,
      max_mana: 100_000,
      crit_chance: 0,
      crit_multiplier: 1_500,
      skill_power: 0,
    },
    star_multipliers: { two: { max_hp: 1_600, attack_damage: 1_500 }, three: { max_hp: 2_500, attack_damage: 2_300 } },
    skill_id: "S_H01",
    visual_profile_id: "VP_H01",
  }],
  skills: [{
    id: "S_H01",
    cast_time_ticks: 10,
    effects: [{ id: "E_H01", primitive: "shield", target: "self", base_value: 22_000, duration_ticks: 80 }],
  }],
  traits: [
    { id: "R_CAT", kind: "species", breakpoints: [{ count: 2, effects: [] }, { count: 4, effects: [] }] },
    { id: "C_GUARDIAN", kind: "class", breakpoints: [{ count: 2, effects: [] }, { count: 4, effects: [] }] },
  ],
  visual_profiles: [{
    id: "VP_H01",
    sprite_key: "heroes/h01/base",
    portrait_key: "heroes/h01/portrait",
    ability_icon_key: "heroes/h01/ability_icon",
    vfx_key: "vfx/h01/cast",
    anchors: ["head", "chest", "back", "feet", "weapon"],
    animations: ["idle", "move", "basic_attack", "hit", "skill_cast", "death"],
  }],
  normal_items: [],
  unique_items: [],
  transformations: [],
  encounters: [],
};

type Compiler = { compileContentBundle: (raw: unknown) => {
  contentHash: string;
  normalItems: readonly unknown[];
  manifest: { heroCount: number; shopHeroCount: number; uniqueHeroCount: number; traitCount: number };
} };

async function loadCompiler(): Promise<Compiler | undefined> {
  return import(compilerModulePath).catch(() => undefined) as Promise<Compiler | undefined>;
}

function createInitialDemoAlphaBundle() {
  const heroes = Array.from({ length: 20 }, (_, index) => ({
    ...baseBundle.heroes[0]!,
    id: `H${String(index + 1).padStart(2, "0")}`,
    species_trait_id: index % 5 === 0 ? "R_CAT" : `R_${index % 5}`,
    class_trait_id: index % 5 === 0 ? "C_GUARDIAN" : `C_${index % 5}`,
    cost: 1,
    is_unique_hero: false,
  }));
  const traits = [
    ...baseBundle.traits,
    ...Array.from({ length: 4 }, (_, index) => ({ id: `R_${index + 1}`, kind: "species", breakpoints: [{ count: 1, effects: [] }] })),
    ...Array.from({ length: 4 }, (_, index) => ({ id: `C_${index + 1}`, kind: "class", breakpoints: [{ count: 1, effects: [] }] })),
  ];
  const transformations = Array.from({ length: 6 }, (_, index) => ({ id: `VT_${index + 1}` }));

  return {
    ...baseBundle,
    version: "alpha-0.3.0",
    heroes,
    traits,
    normal_items: Array.from({ length: 12 }, (_, index) => ({
      id: `I${String(index + 1).padStart(2, "0")}`, kind: "normal", display_key: `item.i${index + 1}.name`, slot_cost: 1, stat_modifiers: [],
    })),
    unique_items: Array.from({ length: 6 }, (_, index) => ({
      id: `U${String(index + 1).padStart(2, "0")}`, kind: "unique", display_key: `item.u${index + 1}.name`, slot_cost: 1, stat_modifiers: [],
      visual_transformation_id: transformations[index]!.id, suggested_holder_tags: ["guardian", "fighter", "frontline"],
    })),
    transformations,
    encounters: Array.from({ length: 8 }, (_, index) => ({
      id: `PVE_${String(index + 1).padStart(2, "0")}`, round: index + 1, kind: "normal", biome: "meadow",
      rewards: index === 3 ? [{ kind: "unique_reveal" }] : [],
    })),
  };
}

describe("content compiler", () => {
  it("accepts the initial Alpha roster with twenty shop heroes and no Unique heroes", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    const compiled = compiler.compileContentBundle(createInitialDemoAlphaBundle());

    expect(compiled.manifest).toMatchObject({ heroCount: 20, shopHeroCount: 20, uniqueHeroCount: 0, traitCount: 10 });
  });

  it("rejects a hero with a rarity outside the five shop tiers", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      heroes: [{ ...baseBundle.heroes[0]!, rarity: 6 }],
    })).toThrow(/H01.*rarity/i);
  });

  it("rejects a Unique hero marked as purchasable", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      heroes: [{ ...baseBundle.heroes[0]!, is_unique_hero: true }],
    })).toThrow(/H01.*Unique.*cost/i);
  });

  it("rejects an encounter with an illegal biome", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      encounters: [{ id: "PVE_01", round: 1, kind: "normal", biome: "void", rewards: [] }],
    })).toThrow(/PVE_01.*biome/i);
  });

  it("rejects a visual profile without ability icon or cast VFX keys", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      visual_profiles: [{ ...baseBundle.visual_profiles[0]!, ability_icon_key: "" }],
    })).toThrow(/VP_H01.*ability_icon_key/i);
    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      visual_profiles: [{ ...baseBundle.visual_profiles[0]!, vfx_key: "" }],
    })).toThrow(/VP_H01.*vfx_key/i);
  });

  it("rejects an Alpha v0.3 bundle that omits mandatory roster, item, and round content", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({ ...baseBundle, version: "alpha-0.3.0" })).toThrow(/Alpha.*20 shop heroes.*0 Unique.*8 encounters/i);
  });

  it("normalizes legacy item trigger spelling into the canonical combat-start trigger", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;
    const bundle = {
      ...baseBundle,
      normal_items: [{
        id: "I10", kind: "normal", display_key: "item.i10.name", slot_cost: 1, stat_modifiers: [],
        triggers: [{ when: "combat_start", effects: [{ id: "E_I10", primitive: "shield", target: "self", base_value: 120, duration_ticks: 120, scales_with_max_hp: true }] }],
      }],
    };

    const item = compiler.compileContentBundle(bundle).normalItems[0] as { triggers?: readonly { trigger?: string }[] };

    expect(item.triggers).toEqual([expect.objectContaining({
      trigger: "on_combat_start",
      effects: [expect.objectContaining({ scalesWithMaxHp: true })],
    })]);
  });

  it("rejects a health-threshold trigger that can fire more than once", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;
    const bundle = {
      ...baseBundle,
      normal_items: [{
        id: "I_BAD", kind: "normal", display_key: "item.bad.name", slot_cost: 1, stat_modifiers: [],
        triggers: [{ when: "hp_below_percent", threshold: 500, effects: [{ id: "E_BAD", primitive: "shield", target: "self", base_value: 1, duration_ticks: 1 }] }],
      }],
    };

    expect(() => compiler.compileContentBundle(bundle)).toThrow(/once_per_combat/i);
  });

  it("rejects a reward choice that omits its server-selectable option count", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      encounters: [{ id: "PVE_01", round: 1, kind: "normal", biome: "meadow", rewards: [{ kind: "normal_item_choice" }] }],
    })).toThrow(/PVE_01.*options/i);
  });

  it("rejects encounter enemies with invalid hero references, positions, or multipliers", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;
    const invalidEncounter = {
      id: "PVE_01",
      round: 1,
      rewards: [],
      enemy_composition: [
        { hero_id: "H_MISSING", position: 0, stat_multiplier: 550 },
        { hero_id: "H01", position: 0, stat_multiplier: 0 },
      ],
    };
    const bundle = {
      version: "test",
      heroes: [
        {
          id: "H01",
          display_key: "hero.h01.name",
          species_trait_id: "R_CAT",
          class_trait_id: "C_GUARDIAN",
          cost: 1,
          rarity: 1,
          tags: ["guardian"],
          is_unique_hero: false,
          base_stats: { max_hp: 1, attack_damage: 0, attack_speed: 1, armor: 0, magic_resist: 0, attack_range: 1, move_speed: 1, starting_mana: 0, max_mana: 1, crit_chance: 0, crit_multiplier: 0, skill_power: 0 },
          star_multipliers: {},
          skill_id: "S01",
          visual_profile_id: "V01",
        },
      ],
      skills: [{ id: "S01", cast_time_ticks: 1, effects: [] }],
      traits: [{ id: "R_CAT", kind: "species", breakpoints: [{ count: 1, effects: [] }] }, { id: "C_GUARDIAN", kind: "class", breakpoints: [{ count: 1, effects: [] }] }],
      visual_profiles: [{ id: "V01", sprite_key: "hero", portrait_key: "hero", ability_icon_key: "hero_icon", vfx_key: "hero_vfx", anchors: ["head", "chest", "back", "feet", "weapon"], animations: ["idle", "move", "basic_attack", "hit", "skill_cast", "death"] }],
      normal_items: [],
      unique_items: [],
      transformations: [],
      encounters: [{ ...invalidEncounter, kind: "normal", biome: "meadow" }],
    };

    expect(() => compiler.compileContentBundle(bundle)).toThrow(/PVE_01.*enemy/i);
  });
  it("canonicalizes object key order before hashing", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    const reordered = {
      ...baseBundle,
      heroes: [{ ...baseBundle.heroes[0]!, base_stats: { ...baseBundle.heroes[0]!.base_stats, max_hp: 90_000 } }],
    };

    expect(compiler.compileContentBundle(baseBundle).contentHash).toBe(compiler.compileContentBundle(reordered).contentHash);
  });

  it("rejects a hero whose skill reference is absent", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      heroes: [{ ...baseBundle.heroes[0]!, skill_id: "S_MISSING" }],
    })).toThrow(/H01.*S_MISSING/);
  });

  it("rejects a trait with non-increasing breakpoints", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      traits: [{ id: "R_CAT", kind: "species", breakpoints: [{ count: 2, effects: [] }, { count: 2, effects: [] }] }, baseBundle.traits[1]!],
    })).toThrow(/R_CAT.*breakpoint/i);
  });

  it("rejects decimal numeric values anywhere in the content bundle", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      normal_items: [{ id: "I01", modifiers: [{ stat: "attack_damage", value: 12.5 }] }],
    })).toThrow(/safe integer/i);
  });

  it("rejects a normal item with an unsupported stat modifier", async () => {
    const compiler = await loadCompiler();
    expect(compiler).toBeDefined();
    if (compiler === undefined) return;

    expect(() => compiler.compileContentBundle({
      ...baseBundle,
      normal_items: [{
        id: "I01", kind: "normal", display_key: "item.i01.name", slot_cost: 1,
        stat_modifiers: [{ stat: "not_a_combat_stat", mode: "percent", value: 100 }],
      }],
    })).toThrow(/I01.*stat/i);
  });
});
