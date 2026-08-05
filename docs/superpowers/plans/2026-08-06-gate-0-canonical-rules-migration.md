# Gate 0 Canonical Rules and Migration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every conflicting Alpha board, shop, progression, economy, item, and Unique limit with one versioned `production-rules-0.1.0` contract consumed by game-core, server, content validation, fixtures, and Godot.

**Architecture:** Author one root ruleset JSON, compile and hash it in `game-core`, inject the compiled contract into Adventure use cases and combat snapshots, and generate a client-safe Godot projection from the same source. Create `alpha-0.4.0` rather than changing the meaning of `alpha-0.3.0`, then add drift checks that prevent independent constants from returning.

**Tech Stack:** TypeScript 5.9, Node.js 22+, pnpm 11, Vitest 4, Fastify 5, Godot 4.7+, GDScript, JSON bundles, GitHub Actions.

## Global Constraints

- Keep H01–H20 and U01–U06 unchanged in cardinality.
- Board: 4 columns × 8 rows; enemy rows `0..3`; player rows `4..7`; global index `row * 4 + column`.
- Player roster storage: 16 local cells; legal global player destinations: `16..31`.
- Shop: 5 slots. Bench: 8 slots.
- Initial level: 3. Maximum level: 9. Maximum deployment cap: 8.
- XP purchase: 4 gold for 4 XP.
- Adventure: 30 HP, 8 starting gold, 5 base income, Unique reveal round 4, 8 rounds.
- Standard defaults compiled but not executed in this gate: 100 HP, 10 gold, interest cap 5, streak bonus cap 3.
- Maximum items per hero: 2. Maximum Unique items per team: 1.
- Tick rate: 20. Maximum combat ticks: 700.
- Gameplay code must fail when a required ruleset is absent or mismatched; no silent legacy fallback.
- `alpha-0.3.0` remains byte-for-byte unchanged; coordinate migration creates `alpha-0.4.0`.
- Gate 0 does not redesign UI, add online rooms, add identity/ranked, or remake assets.

---

## File map

```text
rules/production-0.1.0/ruleset.json
game-core/src/serialization/canonical-json.ts
game-core/src/rules/types.ts
game-core/src/rules/compiler.ts
game-core/src/rules/board.ts
game-core/src/compatibility/content-ruleset.ts
content/alpha-0.4.0/bundle.json
tools/migrate-alpha-board-to-4x8.mjs
tools/export-client-ruleset.mjs
client-godot/assets/rules/production-rules-0.1.0.json
client-godot/scripts/rules/ruleset_catalog.gd
client-godot/scripts/rules/board_layout.gd
docs/evidence/gate-0-rules-foundation.md
```

---

### Task 1: Freeze the Alpha code baseline

**Files:**
- Create: `docs/BASELINE_ALPHA_PVE_0.3.0.md`

**Interfaces:**
- Consumes: commit `417ede007c9627fb0262cf18bf7b1c2af3ac3380`
- Produces: annotated tag `alpha-pve-0.3.0-baseline`

- [ ] **Step 1: Verify the baseline commit**

```bash
git cat-file -e 417ede007c9627fb0262cf18bf7b1c2af3ac3380^{commit}
git show --no-patch --format='%H %s' 417ede007c9627fb0262cf18bf7b1c2af3ac3380
```

Expected: exit `0`; subject is `feat: refresh mobile battle UI`.

- [ ] **Step 2: Verify the baseline in an isolated worktree**

```bash
git worktree add ../MINICHESS-alpha-baseline 417ede007c9627fb0262cf18bf7b1c2af3ac3380
cd ../MINICHESS-alpha-baseline
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

Expected: exit `0`. A failure stops the tagging step and is recorded honestly.

- [ ] **Step 3: Create and push the annotated tag**

```bash
git tag -a alpha-pve-0.3.0-baseline 417ede007c9627fb0262cf18bf7b1c2af3ac3380 -m "Alpha PvE code baseline before production rules migration"
git show --no-patch alpha-pve-0.3.0-baseline
git push origin alpha-pve-0.3.0-baseline
```

- [ ] **Step 4: Create the baseline document**

```markdown
# Alpha PvE 0.3.0 Baseline

- Code commit: `417ede007c9627fb0262cf18bf7b1c2af3ac3380`
- Annotated tag: `alpha-pve-0.3.0-baseline`
- Purpose: rollback/reference point before 4×8 production rules migration
- Verification command: `pnpm run check`
- This tag does not claim physical-device performance or Google Play readiness.
```

- [ ] **Step 5: Commit**

```bash
git add docs/BASELINE_ALPHA_PVE_0.3.0.md
git commit -m "docs: record alpha pve baseline"
```

---

### Task 2: Share canonical serialization while preserving the existing content hash

**Files:**
- Create: `game-core/src/serialization/canonical-json.ts`
- Create: `game-core/test/serialization/canonical-json.test.ts`
- Modify: `game-core/src/content/compiler.ts`
- Test: `game-core/test/content/content-golden.test.ts`

**Interfaces:**
- Produces: `stableStringify(value: unknown): string`
- Produces: `fnv1a64Hex(input: string): string`
- Produces: `sha256Hex(value: unknown): string`
- Preserves: the current 16-hex-character `alpha-0.3.0` content hash

- [ ] **Step 1: Write failing serialization tests**

```ts
import { describe, expect, it } from "vitest";
import { fnv1a64Hex, sha256Hex, stableStringify } from "../../src/serialization/canonical-json.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively and preserves array order", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] }))
      .toBe('{"a":{"x":3,"y":2},"list":[2,1],"z":1}');
  });

  it("keeps the legacy FNV digest stable", () => {
    expect(fnv1a64Hex("abc")).toBe("e71fa2190541574b");
  });

  it("uses a 64-character SHA-256 digest for new rulesets", () => {
    expect(sha256Hex({ b: 2, a: 1 })).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
  });

  it("rejects undefined", () => {
    expect(() => stableStringify({ value: undefined })).toThrow("Unsupported canonical JSON value");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/serialization/canonical-json.test.ts
```

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the shared helpers**

```ts
import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" && Number.isFinite(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => {
      const entry = record[key];
      if (entry === undefined) throw new Error("Unsupported canonical JSON value: undefined");
      return `${JSON.stringify(key)}:${stableStringify(entry)}`;
    }).join(",")}}`;
  }
  throw new Error(`Unsupported canonical JSON value: ${typeof value}`);
}

export function fnv1a64Hex(input: string): string {
  let hash = 0xcbf29ce484222325n;
  for (const character of input) {
    hash ^= BigInt(character.charCodeAt(0));
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  return hash.toString(16).padStart(16, "0");
}

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
```

Modify `game-core/src/content/compiler.ts` to remove its local `stableSerialize`/`fnv1a64Hex`, import `stableStringify` and `fnv1a64Hex`, and continue computing:

```ts
contentHash: fnv1a64Hex(stableStringify(canonical))
```

- [ ] **Step 4: Verify helpers and unchanged content golden**

```bash
pnpm --filter @auto-battler/game-core test -- test/serialization/canonical-json.test.ts test/content/content-golden.test.ts
```

Expected: PASS; no content golden update.

- [ ] **Step 5: Commit**

```bash
git add game-core/src/serialization game-core/src/content/compiler.ts game-core/test/serialization game-core/test/content/content-golden.test.ts
git commit -m "refactor: share canonical bundle hashing"
```

---

### Task 3: Add the authored production ruleset and compiler

**Files:**
- Create: `rules/production-0.1.0/ruleset.json`
- Create: `game-core/src/rules/types.ts`
- Create: `game-core/src/rules/compiler.ts`
- Create: `game-core/test/rules/compiler.test.ts`
- Modify: `game-core/src/index.ts`

**Interfaces:**
- Produces: `compileRuleset(raw: unknown): CompiledRuleset`
- Produces: `CompiledRuleset.rulesetHash` as SHA-256
- Produces typed `board`, `roster`, `shop`, `progression`, `adventure`, and `standard`

- [ ] **Step 1: Write failing compiler tests**

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRuleset } from "../../src/index.js";

const path = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const raw = JSON.parse(readFileSync(path, "utf8"));

describe("production ruleset compiler", () => {
  it("compiles the locked contract", () => {
    const rules = compileRuleset(raw);
    expect(rules.version).toBe("production-rules-0.1.0");
    expect(rules.board).toEqual({ columns: 4, rows: 8, enemyRows: { start: 0, end: 3 }, playerRows: { start: 4, end: 7 }, movement: "orthogonal" });
    expect(rules.shop.slotCount).toBe(5);
    expect(rules.roster).toEqual({ benchSlots: 8, maxItemsPerHero: 2, maxUniquePerTeam: 1 });
    expect(rules.progression.levels.at(-1)).toEqual({ level: 9, xpToNext: 0, boardCap: 8 });
    expect(rules.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects odds that do not sum to 100", () => {
    const invalid = structuredClone(raw);
    invalid.shop.odds_by_level["3"] = [54, 35, 10, 0, 0];
    expect(() => compileRuleset(invalid)).toThrow("shop.odds_by_level.3 must sum to 100");
  });

  it("rejects overlapping territories", () => {
    const invalid = structuredClone(raw);
    invalid.board.player_rows.start = 3;
    expect(() => compileRuleset(invalid)).toThrow("board side rows must not overlap");
  });

  it("rejects a board cap above the sixteen-cell player half", () => {
    const invalid = structuredClone(raw);
    invalid.progression.levels[6].board_cap = 17;
    expect(() => compileRuleset(invalid)).toThrow("board_cap exceeds player board cells");
  });
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/compiler.test.ts
```

- [ ] **Step 3: Create the exact authored ruleset**

```json
{
  "version": "production-rules-0.1.0",
  "tick_rate": 20,
  "max_combat_ticks": 700,
  "board": {
    "columns": 4,
    "rows": 8,
    "enemy_rows": { "start": 0, "end": 3 },
    "player_rows": { "start": 4, "end": 7 },
    "movement": "orthogonal"
  },
  "roster": {
    "bench_slots": 8,
    "max_items_per_hero": 2,
    "max_unique_per_team": 1
  },
  "shop": {
    "slot_count": 5,
    "refresh_cost": 2,
    "copies_by_rarity": { "1": 29, "2": 22, "3": 18, "4": 12, "5": 10 },
    "odds_by_level": {
      "3": [55, 35, 10, 0, 0],
      "4": [45, 35, 18, 2, 0],
      "5": [30, 35, 25, 9, 1],
      "6": [19, 30, 35, 15, 1],
      "7": [15, 20, 35, 25, 5],
      "8": [10, 15, 30, 30, 15],
      "9": [5, 10, 20, 35, 30]
    }
  },
  "progression": {
    "initial_level": 3,
    "max_level": 9,
    "xp_purchase_cost": 4,
    "xp_per_purchase": 4,
    "levels": [
      { "level": 3, "xp_to_next": 10, "board_cap": 3 },
      { "level": 4, "xp_to_next": 20, "board_cap": 4 },
      { "level": 5, "xp_to_next": 36, "board_cap": 5 },
      { "level": 6, "xp_to_next": 56, "board_cap": 6 },
      { "level": 7, "xp_to_next": 80, "board_cap": 7 },
      { "level": 8, "xp_to_next": 100, "board_cap": 8 },
      { "level": 9, "xp_to_next": 0, "board_cap": 8 }
    ]
  },
  "adventure": {
    "initial_health": 30,
    "initial_gold": 8,
    "base_round_income": 5,
    "round_count": 8,
    "unique_reveal_round": 4,
    "loss_damage": { "base": 4, "per_survivor": 2, "cap": 12 }
  },
  "standard": {
    "initial_health": 100,
    "initial_gold": 10,
    "base_round_income": 5,
    "interest_threshold": 10,
    "interest_per_threshold": 1,
    "interest_cap": 5,
    "streak_bonus_cap": 3,
    "planning_seconds_early": 30,
    "planning_seconds_late": 25
  }
}
```

- [ ] **Step 4: Implement immutable compiled types**

`game-core/src/rules/types.ts` defines:

```ts
export interface BoardGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly enemyRows: Readonly<{ start: number; end: number }>;
  readonly playerRows: Readonly<{ start: number; end: number }>;
  readonly movement: "orthogonal";
}

export interface ProgressionLevelRule { readonly level: number; readonly xpToNext: number; readonly boardCap: number; }

export interface CompiledRuleset {
  readonly version: string;
  readonly rulesetHash: string;
  readonly tickRate: number;
  readonly maxCombatTicks: number;
  readonly board: BoardGeometry;
  readonly roster: Readonly<{ benchSlots: number; maxItemsPerHero: number; maxUniquePerTeam: number }>;
  readonly shop: Readonly<{
    slotCount: number;
    refreshCost: number;
    copiesByRarity: Readonly<Record<1 | 2 | 3 | 4 | 5, number>>;
    oddsByLevel: Readonly<Record<number, readonly [number, number, number, number, number]>>;
  }>;
  readonly progression: Readonly<{
    initialLevel: number;
    maxLevel: number;
    xpPurchaseCost: number;
    xpPerPurchase: number;
    levels: readonly ProgressionLevelRule[];
  }>;
  readonly adventure: Readonly<{
    initialHealth: number;
    initialGold: number;
    baseRoundIncome: number;
    roundCount: number;
    uniqueRevealRound: number;
    lossDamage: Readonly<{ base: number; perSurvivor: number; cap: number }>;
  }>;
  readonly standard: Readonly<{
    initialHealth: number;
    initialGold: number;
    baseRoundIncome: number;
    interestThreshold: number;
    interestPerThreshold: number;
    interestCap: number;
    streakBonusCap: number;
    planningSecondsEarly: number;
    planningSecondsLate: number;
  }>;
}
```

- [ ] **Step 5: Implement strict compilation**

`game-core/src/rules/compiler.ts` must use these exact helpers:

```ts
function requireRecord(value: unknown, label: string): Record<string, unknown>;
function requireInteger(value: unknown, label: string, minimum: number): number;
function requireTuple5(value: unknown, label: string): readonly [number, number, number, number, number];
function deepFreeze<T>(value: T): T;
export function compileRuleset(raw: unknown): CompiledRuleset;
```

`compileRuleset` validates:

- non-empty version;
- positive tick rate/max ticks;
- 4×8 dimensions and non-overlapping, in-range row sets;
- bench/item/Unique/shop counts;
- rarity copy counts for tiers 1–5;
- one 5-value odds tuple for every level 3–9, each summing to 100;
- contiguous progression levels 3–9, nondecreasing board cap, final `xpToNext === 0`, earlier thresholds positive;
- Adventure round/reveal/loss values;
- Standard economy/timer values;
- `rulesetHash: sha256Hex(normalizedWithoutHash)`.

Export compiler/types from `game-core/src/index.ts`.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/compiler.test.ts
pnpm --filter @auto-battler/game-core typecheck
git add rules game-core/src/rules game-core/src/index.ts game-core/test/rules/compiler.test.ts
git commit -m "feat: add canonical production ruleset"
```

---

### Task 4: Make combat geometry rules-driven

**Files:**
- Create: `game-core/src/rules/board.ts`
- Create: `game-core/test/rules/board.test.ts`
- Modify: `game-core/src/index.ts`
- Modify: `game-core/src/simulation/kernel.ts`
- Modify: `game-core/test/simulation/kernel.test.ts`

**Interfaces:**
- `boardCellCount(board)`
- `playerBoardCellCount(board)`
- `playerStartCell(board)`
- `assertBoardPosition(board, position)`
- `manhattanDistance(board, left, right)`
- `sortedNeighbors(board, position)`
- `findPathToRange(board, start, target, attackRange, occupied)`
- `selectNearestTarget(board, actor, candidates, occupied)`
- `CombatSnapshot.board: BoardGeometry`

- [ ] **Step 1: Write failing board tests**

```ts
const board = { columns: 4, rows: 8, enemyRows: { start: 0, end: 3 }, playerRows: { start: 4, end: 7 }, movement: "orthogonal" } as const;

expect(boardCellCount(board)).toBe(32);
expect(playerBoardCellCount(board)).toBe(16);
expect(playerStartCell(board)).toBe(16);
expect(manhattanDistance(board, 0, 31)).toBe(10);
expect(sortedNeighbors(board, 0)).toEqual([1, 4]);
expect(sortedNeighbors(board, 3)).toEqual([2, 7]);
expect(sortedNeighbors(board, 17)).toEqual([13, 16, 18, 21]);
```

Add to `kernel.test.ts` after loading/compiling the ruleset:

```ts
it("paths across the four-column board without row wrapping", () => {
  expect(findPathToRange(rules.board, 16, 3, 1, [16, 3])).toEqual([12, 8, 4, 0, 1, 2]);
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/board.test.ts test/simulation/kernel.test.ts
```

- [ ] **Step 3: Implement board helpers**

```ts
export function boardCellCount(board: BoardGeometry): number { return board.columns * board.rows; }
export function playerBoardCellCount(board: BoardGeometry): number { return board.columns * (board.playerRows.end - board.playerRows.start + 1); }
export function playerStartCell(board: BoardGeometry): number { return board.playerRows.start * board.columns; }

export function manhattanDistance(board: BoardGeometry, left: number, right: number): number {
  assertBoardPosition(board, left); assertBoardPosition(board, right);
  return Math.abs(Math.floor(left / board.columns) - Math.floor(right / board.columns))
    + Math.abs(left % board.columns - right % board.columns);
}

export function sortedNeighbors(board: BoardGeometry, position: number): readonly number[] {
  assertBoardPosition(board, position);
  const row = Math.floor(position / board.columns);
  const column = position % board.columns;
  const values: number[] = [];
  if (column > 0) values.push(position - 1);
  if (column + 1 < board.columns) values.push(position + 1);
  if (row > 0) values.push(position - board.columns);
  if (row + 1 < board.rows) values.push(position + board.columns);
  return Object.freeze(values.sort((a, b) => a - b));
}
```

- [ ] **Step 4: Migrate the kernel**

- Add `board` to `CombatSnapshot` and canonicalize/freeze it.
- Remove `BOARD_CELL_COUNT` and all independent 3-column geometry.
- Pass board through pathing, target selection, adjacent/rear targets, dash, retreat, knockback, summon placement, and displacement.
- Rear direction is `+board.columns` for player and `-board.columns` for enemy.
- Validate positions with `assertBoardPosition`.
- Include board in snapshot hashing.

- [ ] **Step 5: Update all combat fixtures and verify**

Every direct snapshot receives `board: rules.board`. Review changed expected paths/events, then run:

```bash
pnpm --filter @auto-battler/game-core test
pnpm --filter @auto-battler/game-core typecheck
```

Expected: all tests pass; identical 4×8 inputs still produce identical logs/hashes.

- [ ] **Step 6: Commit**

```bash
git add game-core/src/rules/board.ts game-core/src/index.ts game-core/src/simulation/kernel.ts game-core/test/rules/board.test.ts game-core/test/simulation/kernel.test.ts
git commit -m "refactor: make combat geometry rules driven"
```

---

### Task 5: Create immutable `alpha-0.4.0` and rules/content compatibility checks

**Files:**
- Create: `tools/migrate-alpha-board-to-4x8.mjs`
- Create: `content/alpha-0.4.0/bundle.json`
- Create: `game-core/src/compatibility/content-ruleset.ts`
- Create: `game-core/test/compatibility/content-ruleset.test.ts`
- Modify: `game-core/src/content/compiler.ts`
- Modify: `game-core/src/index.ts`
- Modify: `game-core/test/content/alpha-bundle.test.ts`
- Modify: `game-core/test/content/content-golden.test.ts`

**Interfaces:**
- Produces: `validateContentAgainstRuleset(content, ruleset): void`
- Migrates: `newPosition = floor(oldPosition / 3) * 4 + (oldPosition % 3)`
- Preserves: exact H01–H20 and U01–U06 IDs

- [ ] **Step 1: Write failing compatibility tests**

```ts
const read = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const rules = compileRuleset(read("../../../rules/production-0.1.0/ruleset.json"));
const content = compileContentBundle(read("../../../content/alpha-0.4.0/bundle.json"));

it("accepts the migrated retained content", () => {
  expect(() => validateContentAgainstRuleset(content, rules)).not.toThrow();
  expect([...content.heroesById.keys()]).toEqual(Array.from({ length: 20 }, (_, i) => `H${String(i + 1).padStart(2, "0")}`));
  expect(content.uniqueItems.map((item) => item.id)).toEqual(["U01", "U02", "U03", "U04", "U05", "U06"]);
});

it("rejects an enemy outside enemy territory", () => {
  const raw = read("../../../content/alpha-0.4.0/bundle.json");
  raw.encounters[0].enemy_composition[0].position = 16;
  expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules)).toThrow("encounter enemy outside enemy territory");
});

it("rejects an item slot cost above two", () => {
  const raw = read("../../../content/alpha-0.4.0/bundle.json");
  raw.normal_items[0].slot_cost = 3;
  expect(() => validateContentAgainstRuleset(compileContentBundle(raw), rules)).toThrow("item slot cost exceeds ruleset limit");
});
```

- [ ] **Step 2: Run and confirm failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/compatibility/content-ruleset.test.ts
```

- [ ] **Step 3: Implement and run the migration script**

```js
import { mkdir, readFile, writeFile } from "node:fs/promises";

const source = JSON.parse(await readFile(new URL("../content/alpha-0.3.0/bundle.json", import.meta.url), "utf8"));
const outputDir = new URL("../content/alpha-0.4.0/", import.meta.url);

function migratePosition(position) {
  if (!Number.isInteger(position) || position < 0 || position >= 12) throw new Error(`Legacy enemy position is invalid: ${position}`);
  return Math.floor(position / 3) * 4 + (position % 3);
}

const migrated = {
  ...source,
  version: "alpha-0.4.0",
  encounters: source.encounters.map((encounter) => ({
    ...encounter,
    ...(encounter.enemy_composition === undefined ? {} : {
      enemy_composition: encounter.enemy_composition.map((enemy) => ({ ...enemy, position: migratePosition(enemy.position) })),
    }),
  })),
};

await mkdir(outputDir, { recursive: true });
await writeFile(new URL("bundle.json", outputDir), `${JSON.stringify(migrated, null, 2)}\n`);
```

```bash
node tools/migrate-alpha-board-to-4x8.mjs
git diff -- content/alpha-0.3.0/bundle.json content/alpha-0.4.0/bundle.json
```

Review: only version and encounter positions differ.

- [ ] **Step 4: Move rules-dependent checks out of the content compiler**

In `content/compiler.ts`:

- keep generic content shape/reference validation;
- remove the hardcoded statement that `unique_reveal` is only valid on round 4;
- apply retained Alpha cardinality validation to both `alpha-0.3.0` and `alpha-0.4.0`;
- do not change the `alpha-0.3.0` hash.

In `content-ruleset.ts`, validate:

- exact 20 shop heroes H01–H20;
- exact U01–U06;
- trait breakpoints do not exceed deployment cap 8;
- item slot cost does not exceed 2;
- no more than one `unique_reveal`, placed on `rules.adventure.uniqueRevealRound`;
- every encounter enemy lies inside enemy rows;
- Adventure encounter rounds cover `1..rules.adventure.roundCount` exactly once.

- [ ] **Step 5: Update golden tests**

Preserve the `alpha-0.3.0` golden hash and add a reviewed `alpha-0.4.0` golden hash. Point current retained-content tests at `alpha-0.4.0` while retaining an immutability test for `alpha-0.3.0`.

- [ ] **Step 6: Verify and commit**

```bash
pnpm --filter @auto-battler/game-core test -- test/content test/compatibility/content-ruleset.test.ts
git add tools/migrate-alpha-board-to-4x8.mjs content/alpha-0.4.0 game-core/src game-core/test
git commit -m "feat: migrate retained content to four-column board"
```

---

### Task 6: Inject rules into Adventure progression, shop, economy, items, and Unique handling

**Files:**
- Create: `server/src/application/progression.ts`
- Modify: `server/src/application/shop-pool.ts`
- Modify: `server/src/application/run-commands.ts`
- Modify: `server/src/application/round-lifecycle.ts`
- Modify: `server/test/run-commands.test.ts`
- Modify: `server/test/shop-pool.test.ts`
- Modify: `server/test/reward-selection.test.ts`

**Interfaces:**
- `RunCommandDependencies { repository, shopGenerator?, ruleset }`
- `createRun(input, dependencies, setup?)`
- `applyRunCommand(input, dependencies)`
- `progressionForRun(run, ruleset)`
- `buyExperience(progression, ruleset)`
- Shop functions consume `CompiledRuleset["shop"]`

- [ ] **Step 1: Load one compiled rules fixture in server tests**

```ts
const rules = compileRuleset(JSON.parse(readFileSync(
  fileURLToPath(new URL("../../rules/production-0.1.0/ruleset.json", import.meta.url)),
  "utf8",
)));
```

- [ ] **Step 2: Write failing rules-driven tests**

Test that `createRun` returns:

```ts
expect(run).toMatchObject({
  rulesetVersion: "production-rules-0.1.0",
  gold: 8,
  health: 30,
  level: 3,
});
expect(run.shop).toHaveLength(5);
expect(run.board).toHaveLength(16);
```

Test moving a bench hero to global cell 16 succeeds, destination 12 fails, and level 9 rejects XP purchase. Test shop pool copy counts/odds come from the supplied rules object by compiling a cloned ruleset with a changed tier-1 copy count and observing that exact total.

- [ ] **Step 3: Run and confirm failure**

```bash
pnpm --filter @auto-battler/server test -- test/run-commands.test.ts test/shop-pool.test.ts test/reward-selection.test.ts
```

- [ ] **Step 4: Extract progression**

```ts
export interface RunProgression { readonly level: number; readonly experience: number; readonly experienceToNext: number; readonly boardCap: number; }

export function progressionForRun(run: Pick<RunRecord, "level" | "experience">, ruleset: CompiledRuleset): RunProgression {
  const level = run.level ?? ruleset.progression.initialLevel;
  const experience = run.experience ?? 0;
  const rule = ruleset.progression.levels.find((candidate) => candidate.level === level);
  if (rule === undefined || experience < 0 || !Number.isSafeInteger(experience)
    || (rule.xpToNext === 0 ? experience !== 0 : experience >= rule.xpToNext)) throw new Error("GAME_RULE_VIOLATION");
  return Object.freeze({ level, experience, experienceToNext: rule.xpToNext, boardCap: rule.boardCap });
}
```

`buyExperience` adds `ruleset.progression.xpPerPurchase`, carries overflow across ruleset levels, and sets experience to 0 at max level.

- [ ] **Step 5: Replace positional run dependencies**

```ts
export interface RunCommandDependencies {
  readonly repository: RunRepository;
  readonly shopGenerator?: ShopGenerator;
  readonly ruleset: CompiledRuleset;
}
```

Add `rulesetVersion` to `CreateRunInput` and `RunRecord`. `createRun` rejects `input.rulesetVersion !== dependencies.ruleset.version`.

Derive all values from rules:

- board length/player offset via board helpers;
- bench/item/Unique limits via `roster`;
- shop size/refresh cost via `shop`;
- level/XP/cap via `progression`;
- starting Adventure health/gold via `adventure`;
- locked snapshot ruleset version from the run.

- [ ] **Step 6: Make shop pool rules-driven**

```ts
createShopPool(content, runSeed, rules: CompiledRuleset["shop"])
rollShop(pool, level, stream, rules: CompiledRuleset["shop"])
shopOddsForLevel(level, rules: CompiledRuleset["shop"])
```

Remove hardcoded copy counts, odds arrays, and slot count.

- [ ] **Step 7: Make lifecycle rules-driven**

```ts
recordResolvedCombat(run, result, ruleset)
attachContentRoundRewards(run, content, ruleset)
claimResolvedRoundReward(run, selections, ruleset)
```

Derive loss damage, health fallback, Unique reveal round, base income, and terminal Adventure round from `ruleset.adventure`.

- [ ] **Step 8: Update all call sites, verify, and commit**

```bash
pnpm --filter @auto-battler/server test
pnpm --filter @auto-battler/server typecheck
git add server/src/application server/test
git commit -m "refactor: drive adventure rules from compiled ruleset"
```

---

### Task 7: Inject rules through runtime, HTTP, and combat resolution

**Files:**
- Modify: `server/src/main.ts`
- Modify: `server/src/runtime.ts`
- Modify: `server/src/http/app.ts`
- Modify: `server/src/application/combat-snapshot.ts`
- Modify: `server/src/application/combat-resolution.ts`
- Modify: `server/src/application/resolve-run-combat.ts`
- Modify: `server/test/http.test.ts`
- Modify: `server/test/combat-snapshot.test.ts`
- Modify: `server/test/runtime.test.ts`

**Interfaces:**
- `ImmutableRulesetRepository.getByVersion(version)`
- `RULESET_BUNDLE_PATH`
- `POST /v1/runs` requires `ruleset_version`
- `GET /v1/rulesets/:rulesetVersion/manifest`
- `CombatSnapshot.board`

- [ ] **Step 1: Define paths and write failing HTTP tests**

At the test top:

```ts
const productionContentPath = fileURLToPath(new URL("../../content/alpha-0.4.0/bundle.json", import.meta.url));
const productionRulesetPath = fileURLToPath(new URL("../../rules/production-0.1.0/ruleset.json", import.meta.url));
```

Test:

```ts
const app = await createRuntimeApp({ contentPath: productionContentPath, rulesetPath: productionRulesetPath });
const manifest = await app.inject({ method: "GET", url: "/v1/rulesets/production-rules-0.1.0/manifest" });
expect(manifest.statusCode).toBe(200);
expect(manifest.json().data).toMatchObject({ ruleset_version: "production-rules-0.1.0", board: { columns: 4, rows: 8 }, shop_slot_count: 5 });

const created = await app.inject({
  method: "POST", url: "/v1/runs",
  payload: { id: "run-http-rules", content_version: "alpha-0.4.0", ruleset_version: "production-rules-0.1.0" },
});
expect(created.statusCode).toBe(201);
expect(created.json().data.board).toHaveLength(16);
expect(created.json().data.shop).toHaveLength(5);
```

Also test missing/unknown ruleset returns 404 `RULESET_VERSION_NOT_FOUND`.

- [ ] **Step 2: Write failing snapshot mapping test**

With local heroes at indexes 0 and 15, assert player global positions `[16, 31]` and `snapshot.board === rules.board`.

- [ ] **Step 3: Run and confirm failure**

```bash
pnpm --filter @auto-battler/server test -- test/http.test.ts test/combat-snapshot.test.ts test/runtime.test.ts
```

- [ ] **Step 4: Load and validate rules at startup**

Add `rulesetPath` to `RuntimeOptions`, implement `loadCompiledRuleset`, create static content/rules repositories, and call `validateContentAgainstRuleset` before listening. `main.ts` resolves `RULESET_BUNDLE_PATH`; default host becomes `0.0.0.0`, with `HOST` override retained.

- [ ] **Step 5: Refactor HTTP dependencies into one object**

```ts
export interface HttpAppDependencies {
  readonly authContext: { actorId: string; tenantId: string };
  readonly repository: RunRepository;
  readonly shopGenerator: ShopGenerator;
  readonly contentRepository: ContentManifestRepository;
  readonly rulesetRepository: ImmutableRulesetRepository;
}
```

`POST /v1/runs` resolves both versions, validates compatibility, and passes the ruleset to `createRun`. Public views include `rulesetVersion`.

Rules manifest response contains version/hash, tick rate, max ticks, board, bench slots, shop slots, and max level only.

- [ ] **Step 6: Make combat resolution rules-aware**

`BuildCombatSnapshotInput` receives `ruleset: CompiledRuleset`, not a loose version string. Player positions use `playerStartCell(ruleset.board) + localPosition`. Snapshot returns `board`, `rulesetVersion`, and `maxTicks` from rules.

`resolveRunCombat` resolves the locked ruleset by version, verifies run/snapshot/rules version equality, validates content compatibility, and passes rules through combat/lifecycle calls.

- [ ] **Step 7: Verify and commit**

```bash
pnpm --filter @auto-battler/server test
pnpm --filter @auto-battler/server typecheck
git add server/src server/test
git commit -m "feat: inject canonical ruleset through adventure runtime"
```

---

### Task 8: Generate and load the client-safe rules projection

**Files:**
- Create: `tools/export-client-ruleset.mjs`
- Create: `client-godot/assets/rules/production-rules-0.1.0.json`
- Create: `client-godot/scripts/rules/ruleset_catalog.gd`
- Create: `client-godot/scripts/rules/board_layout.gd`
- Create: `client-godot/test/ruleset_catalog_test.gd`
- Create: `client-godot/test/board_layout_test.gd`
- Modify: `package.json`

**Interfaces:**
- `RulesetCatalog.ruleset_version/ruleset_hash/board_columns/board_rows/player_start_cell/player_board_cell_count/shop_slot_count/bench_slots/max_level`
- `BoardLayout.cell_center(board_rect, grid_index, columns, rows)`

- [ ] **Step 1: Write failing Godot tests**

Assert rules version/hash exists, board is 4×8, player start/count is 16, shop/bench are 5/8, and max level is 9.

For `Rect2(40, 160, 1000, 960)`, assert cell 0 center `Vector2(165, 220)` and cell 31 center `Vector2(915, 1060)`.

- [ ] **Step 2: Run and confirm failure**

```powershell
& $godot --headless --path client-godot --script res://test/ruleset_catalog_test.gd
& $godot --headless --path client-godot --script res://test/board_layout_test.gd
```

- [ ] **Step 3: Implement the exporter**

The exporter builds/imports game-core, compiles the root ruleset, and writes exactly:

```js
const projection = {
  rulesetVersion: rules.version,
  rulesetHash: rules.rulesetHash,
  tickRate: rules.tickRate,
  maxCombatTicks: rules.maxCombatTicks,
  board: rules.board,
  benchSlots: rules.roster.benchSlots,
  shopSlotCount: rules.shop.slotCount,
  maxLevel: rules.progression.maxLevel,
  progressionLevels: rules.progression.levels,
};
```

`--check` compares canonical generated text and exits 1 with `Client rules projection is stale` on mismatch.

- [ ] **Step 4: Implement `RulesetCatalog` and `BoardLayout`**

`RulesetCatalog` statically caches `res://assets/rules/production-rules-0.1.0.json`, validates dictionary/integer/string fields, and has no legacy fallback.

```gdscript
static func player_start_cell() -> int:
  return int(data().board.playerRows.start) * board_columns()

static func player_board_cell_count() -> int:
  return board_columns() * (int(data().board.playerRows.end) - int(data().board.playerRows.start) + 1)
```

```gdscript
static func cell_center(rect: Rect2, index: int, columns: int, rows: int) -> Vector2:
  assert(index >= 0 and index < columns * rows)
  var size := Vector2(rect.size.x / columns, rect.size.y / rows)
  return rect.position + Vector2((index % columns + 0.5) * size.x, (floori(float(index) / columns) + 0.5) * size.y)
```

- [ ] **Step 5: Add scripts and verify**

```json
"rules:export": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs",
"rules:check": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs --check"
```

```bash
pnpm run rules:export
pnpm run rules:check
```

Run both Godot tests; expected PASS.

- [ ] **Step 6: Commit**

```bash
git add tools/export-client-ruleset.mjs client-godot/assets/rules client-godot/scripts/rules client-godot/test/ruleset_catalog_test.gd client-godot/test/board_layout_test.gd package.json
git commit -m "feat: generate canonical client rules projection"
```

---

### Task 9: Migrate Godot Adventure geometry and invalidate incompatible saves

**Files:**
- Modify: `client-godot/scripts/battle_controller.gd`
- Modify: `client-godot/scripts/unit_view.gd`
- Modify: `client-godot/scripts/presentation/monster_view.gd`
- Modify: `client-godot/scripts/ui/prepare_screen.gd`
- Modify: `client-godot/scripts/ui/formation_controller.gd`
- Modify: `client-godot/scripts/run_api_client.gd`
- Modify: `client-godot/scripts/run_state.gd`
- Modify: `client-godot/scripts/local_run_store.gd`
- Modify: `client-godot/fixtures/combat-replay.json`
- Modify: affected Godot tests

**Interfaces:**
- Public run view includes `rulesetVersion`
- Create run includes `ruleset_version`
- Legal destinations: bench `0..7`, player board `16..31`
- Local board size: 16
- Save schema: 2; schema 1 rejected

- [ ] **Step 1: Update tests before code**

Formation tests:

```gdscript
_expect(controller.request_move("hero-1", 16, "PREPARE"), "first player cell must be legal")
_expect(controller.request_move("hero-1", 31, "PREPARE"), "last player cell must be legal")
_expect(not controller.request_move("hero-1", 12, "PREPARE"), "legacy player cell must be rejected")
_expect(not controller.request_move("hero-1", 32, "PREPARE"), "past-board cell must be rejected")
```

Update run/prepare fixtures to 16 cells and include `rulesetVersion`. API tests expect create body with content/ruleset versions. Save tests expect schema 1 → `{}` and schema 2 → round-trip.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
& $godot --headless --path client-godot --script res://test/formation_controller_test.gd
& $godot --headless --path client-godot --script res://test/run_state_test.gd
& $godot --headless --path client-godot --script res://test/local_run_store_test.gd
& $godot --headless --path client-godot --script res://test/prepare_screen_test.gd
```

- [ ] **Step 3: Replace geometry constants**

- Use `RulesetCatalog` for columns/rows/player offset/count.
- Use `BoardLayout` for combat unit/monster positions.
- Prepare renders 4 enemy rows and 4 player rows, with 16 local player cells.
- Formation legality derives from catalog values.
- Existing visual shell remains; layout redesign belongs to Gate 1.

- [ ] **Step 4: Update API/state/version handling**

```gdscript
func create_run_request(run_id: String, content_version: String, ruleset_version: String) -> Dictionary
func create_run(run_id: String, content_version: String, ruleset_version: String) -> void
```

`battle_controller.gd` explicitly uses:

```gdscript
const CONTENT_VERSION := "alpha-0.4.0"
const RULESET_VERSION := "production-rules-0.1.0"
```

`run_state.gd` stores authoritative `rulesetVersion`.

- [ ] **Step 5: Invalidate old local saves**

`SCHEMA_VERSION := 2`; include `rulesetVersion`; require content `alpha-0.4.0`, rules `production-rules-0.1.0`, and board length 16. Do not reinterpret 12-cell schema-1 saves.

- [ ] **Step 6: Migrate replay positions and run all Godot tests**

Map legacy fixture positions using the same row-preserving formula as content migration. Then:

```powershell
Get-ChildItem client-godot/test/*_test.gd | Sort-Object Name | ForEach-Object {
  & $godot --headless --path client-godot --script "res://test/$($_.Name)"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

- [ ] **Step 7: Commit**

```bash
git add client-godot/scripts client-godot/fixtures client-godot/test
git commit -m "refactor: align godot adventure with four-by-eight rules"
```

---

### Task 10: Add drift checks and canonical documentation

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/GAME_RULES.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/evidence/gate-0-rules-foundation.md`

**Interfaces:**
- Root `pnpm run check` fails on stale client rules
- Evidence document lists exact checks without claiming unrun results

- [ ] **Step 1: Make rules drift part of root checks**

```json
"check": "pnpm run rules:check && pnpm run typecheck && pnpm run test"
```

CI runs a named `Verify generated rules projection` step before the full check.

- [ ] **Step 2: Rewrite conflicting documentation**

`GAME_RULES.md` references the authored ruleset as source of truth and states 4×8, global cells 16–31, five shop slots, levels 3–9, XP enabled, and rules-driven Adventure values. Remove the old 3×8/four-shop/no-XP claims.

`ARCHITECTURE.md` documents `ruleset_version → content_version → asset_bundle_version` locking and runtime repositories.

README starts server with explicit `CONTENT_BUNDLE_PATH=content/alpha-0.4.0/bundle.json` and `RULESET_BUNDLE_PATH=rules/production-0.1.0/ruleset.json`. It does not claim device playability.

- [ ] **Step 3: Create evidence checklist**

```markdown
# Gate 0 Rules Foundation Evidence

Required commands:
- `pnpm run rules:check`
- `pnpm run typecheck`
- `pnpm run test`
- all Godot headless tests
- `git diff --check`

Required invariants:
- identical ruleset version/hash in server and Godot projection
- 4×8 board throughout
- 16 local player cells and global cells 16–31
- five-slot shop, level cap 9, deployment cap 8
- H01–H20 and U01–U06 retained
- `alpha-0.3.0` unchanged; migrated content is `alpha-0.4.0`

This file is a checklist; fresh command output remains the evidence.
```

- [ ] **Step 4: Run drift audit**

```bash
pnpm run rules:check
git diff --check
git grep -nE 'BOARD_CELL_COUNT = 24|Array\(12\)|destination - 12|MAX_PLAYER_BOARD_CAP = 6|slotCount = 4' -- game-core/src server/src client-godot/scripts || true
```

Review every result; only explicitly named legacy migration code/tests may remain.

- [ ] **Step 5: Commit**

```bash
git add package.json .github/workflows/ci.yml README.md docs/GAME_RULES.md docs/ARCHITECTURE.md docs/evidence/gate-0-rules-foundation.md
git commit -m "docs: lock canonical production rules workflow"
```

---

### Task 11: Execute the Gate 0 acceptance gate

**Files:**
- Update: `docs/evidence/gate-0-rules-foundation.md` only with immutable CI/review references

**Interfaces:**
- Produces: accepted tag `gate-0-rules-foundation`
- Unlocks: Gate 1 detailed plan

- [ ] **Step 1: Clean install and full TypeScript verification**

```bash
rm -rf node_modules game-core/node_modules server/node_modules game-core/dist server/dist
corepack enable
pnpm install --frozen-lockfile
pnpm run rules:check
pnpm run typecheck
pnpm run test
```

- [ ] **Step 2: Run every Godot headless test**

```powershell
Get-ChildItem client-godot/test/*_test.gd | Sort-Object Name | ForEach-Object {
  Write-Host "RUN $($_.Name)"
  & $godot --headless --path client-godot --script "res://test/$($_.Name)"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

- [ ] **Step 3: Smoke-test the explicit Adventure API**

```bash
CONTENT_BUNDLE_PATH=content/alpha-0.4.0/bundle.json \
RULESET_BUNDLE_PATH=rules/production-0.1.0/ruleset.json \
HOST=127.0.0.1 PORT=3000 \
pnpm --filter @auto-battler/server start
```

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/v1/rulesets/production-rules-0.1.0/manifest
curl -fsS -X POST http://127.0.0.1:3000/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{"id":"gate-0-smoke","content_version":"alpha-0.4.0","ruleset_version":"production-rules-0.1.0"}'
```

Expected: health OK; manifest 4×8/five slots; run has 16 board cells, five shop slots, level 3, 8 gold, 30 HP.

- [ ] **Step 4: Verify version immutability and clean diff**

```bash
git diff --exit-code alpha-pve-0.3.0-baseline -- content/alpha-0.3.0/bundle.json
git show alpha-pve-0.3.0-baseline:content/alpha-0.3.0/bundle.json | sha256sum
git show HEAD:content/alpha-0.3.0/bundle.json | sha256sum
git diff --check
pnpm run rules:check
git status --short
```

- [ ] **Step 5: Request code review**

Review explicitly checks hidden three-column geometry, missing-rules fallbacks, stale-save reinterpretation, content/rules validation, drift protection, and deterministic replay.

- [ ] **Step 6: Re-run affected checks after review fixes**

Use the receiving-code-review workflow. No gate tag is created from pre-review evidence.

- [ ] **Step 7: Tag accepted Gate 0**

```bash
git tag -a gate-0-rules-foundation HEAD -m "Accepted Gate 0 canonical production rules foundation"
git push origin gate-0-rules-foundation
```

- [ ] **Step 8: Commit evidence references only when changed**

```bash
git add docs/evidence/gate-0-rules-foundation.md
git commit -m "docs: record gate zero rules evidence"
```

Do not create an empty commit.

---

## Self-review result

- Every Gate 0 master requirement maps to a task.
- Content hash compatibility and ruleset hash use different explicit algorithms intentionally.
- Function signatures are defined before downstream use.
- No future subsystem is smuggled into Gate 0.
- Every code-changing task has a failing test, minimal implementation boundary, passing verification, and commit.
- No `TBD`, `TODO`, date placeholder, or undefined test helper remains.
