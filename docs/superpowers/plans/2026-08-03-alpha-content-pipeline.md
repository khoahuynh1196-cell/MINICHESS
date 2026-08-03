# Alpha Content Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provide a versioned, deterministic and validated Alpha content bundle containing the approved 20 heroes, traits, items, Unique transformations and PvE encounters.

**Architecture:** Human-editable JSON stays in `/content/alpha-0.3.0`; `game-core` is the only compiler/validator. The compiler maps snake_case content data to immutable normalized data, validates all cross-references and produces a canonical FNV-1a hash independent of filesystem or object-key order.

**Tech Stack:** TypeScript strict mode, Vitest, JSON content, `game-core` without filesystem dependencies in production.

## Global Constraints

- Public IDs are fixed: heroes `H01`–`H20`, normal items `I01`–`I12`, Unique `U01`–`U06`, species `R_*`, classes `C_*`.
- Content has data only: no callbacks, eval, code strings or database queries.
- All numeric combat values are safe integers in `SCALE = 1000`; no JSON floats.
- Every hero has one species trait, one class trait, one skill and one visual profile with five anchors and six animations.
- Exactly 8 consecutive PvE encounters exist; only round 4 grants `unique_reveal`.
- Do not add combat primitive types; effects map only to existing `CombatEffect` definitions.

---

### Task 1: Define normalized content types and canonical compiler

**Files:**
- Create: `game-core/src/content/types.ts`
- Create: `game-core/src/content/compiler.ts`
- Modify: `game-core/src/index.ts`
- Test: `game-core/test/content/compiler.test.ts`

**Interfaces:**
- Consumes: `RawContentBundle` with snake_case fields.
- Produces: `compileContentBundle(raw: RawContentBundle): CompiledContentBundle`, whose `contentHash` is a 16-character lower-case FNV-1a hash and whose maps are keyed by public ID.

- [x] **Step 1: Write failing compiler tests**

```ts
it("canonicalizes key order before hashing", () => {
  expect(compileContentBundle(bundleA).contentHash).toBe(compileContentBundle(bundleBWithReorderedKeys).contentHash);
});

it("rejects a hero that references an absent skill", () => {
  expect(() => compileContentBundle(bundleWithMissingSkill)).toThrow(/H01.*S_MISSING/);
});
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/compiler.test.ts`

Expected: FAIL because the compiler does not exist.

- [x] **Step 3: Implement types, immutable maps and canonical serialization**

```ts
export function compileContentBundle(raw: RawContentBundle): CompiledContentBundle {
  validateBundle(raw);
  return Object.freeze({
    version: raw.version,
    heroesById: toReadonlyMap(raw.heroes),
    contentHash: fnv1a64Hex(stableSerialize(raw)),
  });
}
```

Validate unique IDs, raw type shapes, effect definitions through `validateEffectDefinition`, all public references and safe integer values before constructing the result.

- [x] **Step 4: Run the compiler tests and workspace check**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/compiler.test.ts`

Run: `pnpm run check`

Expected: PASS.

### Task 2: Seed the fixed Alpha roster, skills and visual profiles

**Files:**
- Create: `content/alpha-0.3.0/bundle.json`
- Test: `game-core/test/content/alpha-bundle.test.ts`

**Interfaces:**
- Consumes: raw JSON bundle parsed by the test fixture.
- Produces: 20 valid heroes H01–H20, 20 skills, and 20 complete visual profiles.

- [x] **Step 1: Write a failing roster test**

```ts
it("contains the approved species, classes and all twenty hero IDs", () => {
  const compiled = compileAlphaBundle();
  expect([...compiled.heroesById.keys()]).toEqual(["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09", "H10", "H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20"]);
  expect(countBy(compiled.heroes, "speciesTraitId")).toEqual({ R_CAT: 5, R_DOG: 5, R_RABBIT: 4, R_COW: 3, R_EXOTIC: 3 });
  expect(countBy(compiled.heroes, "classTraitId")).toEqual({ C_GUARDIAN: 4, C_FIGHTER: 4, C_RANGER: 4, C_MAGE: 4, C_SUPPORT: 4 });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/alpha-bundle.test.ts`

Expected: FAIL because the Alpha bundle is absent.

- [x] **Step 3: Add the static JSON roster and content-specific validation**

Every hero has required base stats, cost in `[1, 3]`, star multipliers, skill and visual profile. Use the approved H01–H20 species/class/cost/role mapping; represent mechanics only with existing effect chains.

- [x] **Step 4: Run the roster test**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/alpha-bundle.test.ts`

Expected: PASS with 20 heroes and 20 profiles.

### Task 3: Seed traits, normal items, Unique transformations and encounters

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`
- Modify: `game-core/test/content/alpha-bundle.test.ts`

**Interfaces:**
- Consumes: the roster from Task 2.
- Produces: 5 species traits, 5 class traits, 12 normal items, 6 Unique items/transformation profiles and 8 PvE encounters.

- [x] **Step 1: Write failing completeness and round-4 tests**

```ts
it("has the Alpha item and encounter inventory", () => {
  expect(compiled.normalItems).toHaveLength(12);
  expect(compiled.uniqueItems).toHaveLength(6);
  expect(compiled.encounters.map((encounter) => encounter.round)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  expect(compiled.encounters.filter(hasUniqueReveal).map((encounter) => encounter.round)).toEqual([4]);
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/alpha-bundle.test.ts`

Expected: FAIL because items, transformations or encounters are incomplete.

- [x] **Step 3: Add the approved Alpha data**

Seed I01–I12 and U01–U06. Each Unique references exactly one transformation and declares at least three compatible holder tags. Add all five species and all five class traits with strictly increasing breakpoints, plus exactly one encounter for each round 1 through 8.

- [x] **Step 4: Run the bundle tests**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/alpha-bundle.test.ts`

Expected: PASS.

### Task 4: Add deterministic bundle load verification and developer commands

**Files:**
- Create: `game-core/test/content/content-golden.test.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: `content/alpha-0.3.0/bundle.json` and `compileContentBundle`.
- Produces: a golden manifest containing version, counts and canonical content hash.

- [x] **Step 1: Write a failing golden test**

```ts
it("keeps the Alpha bundle deterministic", () => {
  const first = compileAlphaBundle();
  const second = compileAlphaBundle();
  expect(second.contentHash).toBe(first.contentHash);
  expect(first).toMatchObject({ version: "alpha-0.3.0", manifest: { heroCount: 20, normalItemCount: 12, uniqueItemCount: 6, encounterCount: 8 } });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/content-golden.test.ts`

Expected: FAIL because no Alpha compiler fixture/export exists.

- [x] **Step 3: Implement the fixture loader and README command**

Use a test-only filesystem loader to parse the static JSON. Document `pnpm --filter @auto-battler/game-core exec vitest run test/content` as the content gate.

- [x] **Step 4: Verify the entire pipeline**

Run: `pnpm run check`

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content`

Expected: all content and workspace tests pass with an unchanged hash on a second process invocation.
