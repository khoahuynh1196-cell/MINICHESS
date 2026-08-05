# Gate 0 Canonical Rules and Migration Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace every conflicting Alpha board, shop, progression, economy, item, and Unique limit with one versioned `production-rules-0.1.0` contract consumed by game-core, server, content validation, fixtures, and Godot.

**Architecture:** Author one root ruleset JSON, validate and hash it in `game-core`, inject the compiled ruleset into Adventure server use cases and combat snapshots, and generate a presentation-safe Godot projection from the same source. Migrate the existing Alpha content to a new immutable content version for 4×8 coordinates, preserve deterministic replay behavior, and add drift checks so future layers cannot reintroduce independent constants.

**Tech Stack:** TypeScript 5.9, Node.js 22+, pnpm 11, Vitest 4, Fastify 5, Godot 4.7+, GDScript, JSON rules/content bundles, GitHub Actions.

## Global Constraints

- Keep H01–H20 and U01–U06 unchanged in cardinality during this gate.
- Canonical board is 4 columns × 8 rows, enemy rows `0..3`, player rows `4..7`, global grid index `row * 4 + column`.
- Player roster storage contains 16 local board cells; global player destinations are `16..31`.
- Shop has exactly five slots; bench has exactly eight slots.
- Initial level is 3; maximum level is 9; maximum deployment cap is 8.
- XP purchase costs 4 gold and grants 4 XP.
- Adventure starts at 30 HP and 8 gold, grants 5 base gold per resolved round, reveals one Unique at round 4, and ends after round 8.
- Standard online defaults are compiled but not executed in Gate 0: 100 HP, 10 gold, +1 interest per 10 saved gold capped at +5, streak bonus capped at +3.
- A hero holds at most two items; a team owns at most one Unique.
- Combat tick rate is 20 ticks/second and maximum combat duration is 700 ticks.
- No production gameplay constant may default silently when the ruleset is absent.
- Existing Alpha content meaning must not be changed under `alpha-0.3.0`; coordinate changes create `alpha-0.4.0`.
- No UI redesign, online room, identity, ranked, or asset remake work belongs in Gate 0.

---

## File structure locked by this gate

```text
/rules/production-0.1.0/ruleset.json
/game-core/src/serialization/canonical-json.ts
/game-core/src/rules/types.ts
/game-core/src/rules/compiler.ts
/game-core/src/rules/board.ts
/game-core/src/compatibility/content-ruleset.ts
/game-core/test/rules/compiler.test.ts
/game-core/test/rules/board.test.ts
/game-core/test/compatibility/content-ruleset.test.ts
/content/alpha-0.4.0/bundle.json
/tools/migrate-alpha-board-to-4x8.mjs
/tools/export-client-ruleset.mjs
/client-godot/assets/rules/production-rules-0.1.0.json
/client-godot/scripts/rules/ruleset_catalog.gd
/client-godot/scripts/rules/board_layout.gd
/client-godot/test/ruleset_catalog_test.gd
/client-godot/test/board_layout_test.gd
/docs/evidence/gate-0-rules-foundation.md
```

Existing files are modified only where listed in tasks below. Legacy constants are removed only after their consumers pass against the compiled ruleset.

---

### Task 1: Freeze and record the Alpha code baseline

**Files:**
- Create: `docs/BASELINE_ALPHA_PVE_0.3.0.md`

**Interfaces:**
- Consumes: code commit `417ede007c9627fb0262cf18bf7b1c2af3ac3380`
- Produces: annotated tag `alpha-pve-0.3.0-baseline` and a permanent rollback reference

- [ ] **Step 1: Verify the exact baseline commit exists**

Run:

```bash
git cat-file -e 417ede007c9627fb0262cf18bf7b1c2af3ac3380^{commit}
git show --no-patch --format='%H %s' 417ede007c9627fb0262cf18bf7b1c2af3ac3380
```

Expected: exit `0` and output beginning with `417ede007c9627fb0262cf18bf7b1c2af3ac3380 feat: refresh mobile battle UI`.

- [ ] **Step 2: Run the baseline verification commands from that commit in an isolated worktree**

Run:

```bash
git worktree add ../MINICHESS-alpha-baseline 417ede007c9627fb0262cf18bf7b1c2af3ac3380
cd ../MINICHESS-alpha-baseline
corepack enable
pnpm install --frozen-lockfile
pnpm run check
```

Expected: exit `0`. If the command fails, preserve the output in the baseline document and stop; do not tag a baseline as verified.

- [ ] **Step 3: Create and verify the annotated baseline tag**

Run from the primary repository:

```bash
git tag -a alpha-pve-0.3.0-baseline 417ede007c9627fb0262cf18bf7b1c2af3ac3380 -m "Alpha PvE code baseline before production rules migration"
git show --no-patch --decorate alpha-pve-0.3.0-baseline
git push origin alpha-pve-0.3.0-baseline
```

Expected: the tag resolves to the exact baseline commit and is pushed successfully.

- [ ] **Step 4: Write the baseline record**

Create `docs/BASELINE_ALPHA_PVE_0.3.0.md` with:

```markdown
# Alpha PvE 0.3.0 Baseline

- Code commit: `417ede007c9627fb0262cf18bf7b1c2af3ac3380`
- Annotated tag: `alpha-pve-0.3.0-baseline`
- Purpose: rollback/reference point before 4×8 production rules migration
- Verification command: `pnpm run check`
- This tag does not claim physical-device performance or Google Play readiness.
```

- [ ] **Step 5: Commit the baseline record**

```bash
git add docs/BASELINE_ALPHA_PVE_0.3.0.md
git commit -m "docs: record alpha pve baseline"
```

---

### Task 2: Extract canonical JSON hashing without changing content hashes

**Files:**
- Create: `game-core/src/serialization/canonical-json.ts`
- Modify: `game-core/src/content/compiler.ts`
- Test: `game-core/test/content/content-golden.test.ts`
- Test: `game-core/test/serialization/canonical-json.test.ts`

**Interfaces:**
- Produces: `stableStringify(value: unknown): string`
- Produces: `sha256Hex(value: unknown): string`
- Preserves: the existing `alpha-0.3.0` compiled `contentHash`

- [ ] **Step 1: Write canonical serialization tests**

Create `game-core/test/serialization/canonical-json.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { sha256Hex, stableStringify } from "../../src/serialization/canonical-json.js";

describe("canonical JSON", () => {
  it("sorts object keys recursively while preserving array order", () => {
    expect(stableStringify({ z: 1, a: { y: 2, x: 3 }, list: [2, 1] }))
      .toBe('{"a":{"x":3,"y":2},"list":[2,1],"z":1}');
  });

  it("produces the same digest for equivalent key orderings", () => {
    expect(sha256Hex({ b: 2, a: 1 })).toBe(sha256Hex({ a: 1, b: 2 }));
  });

  it("rejects undefined because authored bundles must be JSON-safe", () => {
    expect(() => stableStringify({ value: undefined })).toThrow("Unsupported canonical JSON value");
  });
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```bash
pnpm --filter @auto-battler/game-core test -- test/serialization/canonical-json.test.ts
```

Expected: FAIL because `src/serialization/canonical-json.ts` does not exist.

- [ ] **Step 3: Implement canonical serialization**

Create `game-core/src/serialization/canonical-json.ts`:

```ts
import { createHash } from "node:crypto";

export function stableStringify(value: unknown): string {
  if (value === null || typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
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

export function sha256Hex(value: unknown): string {
  return createHash("sha256").update(stableStringify(value)).digest("hex");
}
```

Modify `game-core/src/content/compiler.ts` to import these helpers and replace its local canonical serialization/hash implementation. Do not change the object being hashed.

- [ ] **Step 4: Run serialization and content golden tests**

```bash
pnpm --filter @auto-battler/game-core test -- test/serialization/canonical-json.test.ts test/content/content-golden.test.ts
```

Expected: PASS; the existing content golden digest remains unchanged.

- [ ] **Step 5: Commit**

```bash
git add game-core/src/serialization/canonical-json.ts game-core/src/content/compiler.ts game-core/test/serialization/canonical-json.test.ts game-core/test/content/content-golden.test.ts
git commit -m "refactor: share canonical bundle hashing"
```

---

### Task 3: Add the authored production ruleset and compiler

**Files:**
- Create: `rules/production-0.1.0/ruleset.json`
- Create: `game-core/src/rules/types.ts`
- Create: `game-core/src/rules/compiler.ts`
- Modify: `game-core/src/index.ts`
- Test: `game-core/test/rules/compiler.test.ts`

**Interfaces:**
- Produces: `compileRuleset(raw: unknown): CompiledRuleset`
- Produces: `CompiledRuleset.version === "production-rules-0.1.0"`
- Produces: `CompiledRuleset.rulesetHash`
- Produces: typed `board`, `shop`, `progression`, `roster`, `adventure`, and `standard` rules

- [ ] **Step 1: Write compiler tests for the locked rules**

Create `game-core/test/rules/compiler.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileRuleset } from "../../src/index.js";

const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const raw = JSON.parse(readFileSync(rulesPath, "utf8"));

describe("production ruleset compiler", () => {
  it("compiles the locked 4x8 production contract", () => {
    const rules = compileRuleset(raw);
    expect(rules.version).toBe("production-rules-0.1.0");
    expect(rules.board).toEqual({
      columns: 4, rows: 8,
      enemyRows: { start: 0, end: 3 },
      playerRows: { start: 4, end: 7 },
      movement: "orthogonal",
    });
    expect(rules.shop.slotCount).toBe(5);
    expect(rules.roster.benchSlots).toBe(8);
    expect(rules.progression.levels.at(-1)).toEqual({ level: 9, xpToNext: 0, boardCap: 8 });
    expect(rules.adventure).toMatchObject({ initialHealth: 30, initialGold: 8, roundCount: 8, uniqueRevealRound: 4 });
    expect(rules.standard).toMatchObject({ initialHealth: 100, initialGold: 10, interestCap: 5, streakBonusCap: 3 });
    expect(rules.rulesetHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects odds that do not sum to one hundred", () => {
    const invalid = structuredClone(raw);
    invalid.shop.odds_by_level[3] = [54, 35, 10, 0, 0];
    expect(() => compileRuleset(invalid)).toThrow("shop.odds_by_level.3 must sum to 100");
  });

  it("rejects overlapping player and enemy row ranges", () => {
    const invalid = structuredClone(raw);
    invalid.board.player_rows.start = 3;
    expect(() => compileRuleset(invalid)).toThrow("board side rows must not overlap");
  });

  it("rejects a deployment cap larger than the player half", () => {
    const invalid = structuredClone(raw);
    invalid.progression.levels[6].board_cap = 17;
    expect(() => compileRuleset(invalid)).toThrow("board_cap exceeds player board cells");
  });
});
```

- [ ] **Step 2: Run the test and verify it fails**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/compiler.test.ts
```

Expected: FAIL because `compileRuleset` and the authored JSON do not exist.

- [ ] **Step 3: Create the authored ruleset**

Create `rules/production-0.1.0/ruleset.json` exactly as follows:

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

- [ ] **Step 4: Implement ruleset types and validation**

Create `game-core/src/rules/types.ts` with immutable camelCase interfaces, including:

```ts
export interface BoardGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly enemyRows: Readonly<{ start: number; end: number }>;
  readonly playerRows: Readonly<{ start: number; end: number }>;
  readonly movement: "orthogonal";
}

export interface ProgressionLevelRule {
  readonly level: number;
  readonly xpToNext: number;
  readonly boardCap: number;
}

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

Create `game-core/src/rules/compiler.ts` with strict record/array/integer guards, all assertions exercised above, recursive freezing, and `rulesetHash: sha256Hex(raw)`.

Modify `game-core/src/index.ts`:

```ts
export { compileRuleset } from "./rules/compiler.js";
export type { BoardGeometry, CompiledRuleset, ProgressionLevelRule } from "./rules/types.js";
```

- [ ] **Step 5: Run focused tests and typecheck**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/compiler.test.ts
pnpm --filter @auto-battler/game-core typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add rules/production-0.1.0/ruleset.json game-core/src/rules game-core/src/index.ts game-core/test/rules/compiler.test.ts
git commit -m "feat: add canonical production ruleset"
```

---

### Task 4: Replace hardcoded combat geometry with board helpers

**Files:**
- Create: `game-core/src/rules/board.ts`
- Modify: `game-core/src/index.ts`
- Modify: `game-core/src/simulation/kernel.ts`
- Modify: `game-core/test/simulation/kernel.test.ts`
- Create: `game-core/test/rules/board.test.ts`

**Interfaces:**
- Produces: `boardCellCount(board: BoardGeometry): number`
- Produces: `playerBoardCellCount(board: BoardGeometry): number`
- Produces: `playerStartCell(board: BoardGeometry): number`
- Produces: `manhattanDistance(board, left, right): number`
- Produces: `sortedNeighbors(board, position): readonly number[]`
- Changes: `findPathToRange(board, start, target, attackRange, occupiedPositions)`
- Changes: `selectNearestTarget(board, actor, candidates, occupiedPositions)`
- Changes: `CombatSnapshot.board: BoardGeometry`

- [ ] **Step 1: Write 4×8 board helper tests**

Create `game-core/test/rules/board.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  boardCellCount, manhattanDistance, playerBoardCellCount,
  playerStartCell, sortedNeighbors,
  type BoardGeometry,
} from "../../src/index.js";

const board: BoardGeometry = {
  columns: 4, rows: 8,
  enemyRows: { start: 0, end: 3 },
  playerRows: { start: 4, end: 7 },
  movement: "orthogonal",
};

describe("board geometry", () => {
  it("derives the full and player board sizes", () => {
    expect(boardCellCount(board)).toBe(32);
    expect(playerBoardCellCount(board)).toBe(16);
    expect(playerStartCell(board)).toBe(16);
  });

  it("uses four-column Manhattan geometry", () => {
    expect(manhattanDistance(board, 0, 31)).toBe(10);
    expect(manhattanDistance(board, 16, 19)).toBe(3);
  });

  it("returns sorted orthogonal neighbors without row wrapping", () => {
    expect(sortedNeighbors(board, 0)).toEqual([1, 4]);
    expect(sortedNeighbors(board, 3)).toEqual([2, 7]);
    expect(sortedNeighbors(board, 17)).toEqual([13, 16, 18, 21]);
  });
});
```

- [ ] **Step 2: Add a failing kernel test for the new board parameter**

In `game-core/test/simulation/kernel.test.ts`, load the production ruleset once and add `board: rules.board` to the shared snapshot. Add:

```ts
it("paths across all thirty-two cells without three-column wrapping", () => {
  expect(findPathToRange(rules.board, 16, 3, 1, [16, 3])).toEqual([12, 8, 4]);
});
```

Update imports to include `compileRuleset` and `findPathToRange`.

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/rules/board.test.ts test/simulation/kernel.test.ts
```

Expected: FAIL because helpers/signatures and `CombatSnapshot.board` are absent.

- [ ] **Step 4: Implement the board helper module**

Create `game-core/src/rules/board.ts`:

```ts
import type { BoardGeometry } from "./types.js";

export function boardCellCount(board: BoardGeometry): number {
  return board.columns * board.rows;
}

export function playerBoardCellCount(board: BoardGeometry): number {
  return board.columns * (board.playerRows.end - board.playerRows.start + 1);
}

export function playerStartCell(board: BoardGeometry): number {
  return board.playerRows.start * board.columns;
}

export function assertBoardPosition(board: BoardGeometry, position: number): void {
  if (!Number.isSafeInteger(position) || position < 0 || position >= boardCellCount(board)) {
    throw new Error(`Invalid board position: ${position}`);
  }
}

export function manhattanDistance(board: BoardGeometry, left: number, right: number): number {
  assertBoardPosition(board, left);
  assertBoardPosition(board, right);
  const leftRow = Math.floor(left / board.columns);
  const leftColumn = left % board.columns;
  const rightRow = Math.floor(right / board.columns);
  const rightColumn = right % board.columns;
  return Math.abs(leftRow - rightRow) + Math.abs(leftColumn - rightColumn);
}

export function sortedNeighbors(board: BoardGeometry, position: number): readonly number[] {
  assertBoardPosition(board, position);
  const row = Math.floor(position / board.columns);
  const column = position % board.columns;
  const neighbors: number[] = [];
  if (column > 0) neighbors.push(position - 1);
  if (column + 1 < board.columns) neighbors.push(position + 1);
  if (row > 0) neighbors.push(position - board.columns);
  if (row + 1 < board.rows) neighbors.push(position + board.columns);
  return Object.freeze(neighbors.sort((left, right) => left - right));
}
```

Export these functions from `game-core/src/index.ts`.

- [ ] **Step 5: Migrate the combat kernel**

In `game-core/src/simulation/kernel.ts`:

- Remove `BOARD_CELL_COUNT` and every `/ 3`, `% 3`, `+ 3`, `- 3`, row `7`, and column `2` geometry assumption.
- Add `readonly board: BoardGeometry` to `CombatSnapshot`.
- Validate unit positions with `assertBoardPosition(snapshot.board, unit.position)`.
- Pass `snapshot.board` through pathfinding, targeting, adjacency, rear-ally selection, dash, retreat, knockback, summon placement, and any helper that compares cells.
- Replace rear-ally direction with `source.side === "player" ? snapshot.board.columns : -snapshot.board.columns`.
- Canonicalize/freeze the board inside `canonicalizeSnapshot` so it participates in result hashing.

The exported signatures must be:

```ts
export function findPathToRange(
  board: BoardGeometry,
  start: number,
  target: number,
  attackRange: number,
  occupiedPositions: readonly number[],
): readonly number[] | undefined;

export function selectNearestTarget(
  board: BoardGeometry,
  actor: TargetingUnit,
  candidates: readonly TargetingUnit[],
  occupiedPositions: readonly number[],
): TargetingUnit | undefined;
```

- [ ] **Step 6: Update every kernel fixture to carry the production board**

Load `rules/production-0.1.0/ruleset.json`, compile it, and set `board: rules.board` in all direct `CombatSnapshot` fixtures. Update expected movement cells only where 4-column geometry changes the path.

- [ ] **Step 7: Run the full game-core suite**

```bash
pnpm --filter @auto-battler/game-core test
pnpm --filter @auto-battler/game-core typecheck
```

Expected: PASS and deterministic duplicate-input tests still produce identical event logs/result hashes.

- [ ] **Step 8: Commit**

```bash
git add game-core/src/rules/board.ts game-core/src/index.ts game-core/src/simulation/kernel.ts game-core/test/rules/board.test.ts game-core/test/simulation/kernel.test.ts
git commit -m "refactor: make combat geometry rules driven"
```

---

### Task 5: Create `alpha-0.4.0` content and validate it against the ruleset

**Files:**
- Create: `tools/migrate-alpha-board-to-4x8.mjs`
- Create: `content/alpha-0.4.0/bundle.json`
- Create: `game-core/src/compatibility/content-ruleset.ts`
- Modify: `game-core/src/index.ts`
- Test: `game-core/test/compatibility/content-ruleset.test.ts`
- Modify: `game-core/test/content/alpha-bundle.test.ts`
- Modify: `game-core/test/content/content-golden.test.ts`

**Interfaces:**
- Produces: `validateContentAgainstRuleset(content, ruleset): void`
- Produces: immutable content version `alpha-0.4.0`
- Preserves: H01–H20 and U01–U06 cardinality
- Migrates old enemy cell `oldRow * 3 + oldColumn` to `oldRow * 4 + oldColumn`

- [ ] **Step 1: Write migration and compatibility tests**

Create `game-core/test/compatibility/content-ruleset.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { compileContentBundle, compileRuleset, validateContentAgainstRuleset } from "../../src/index.js";

const read = (relative: string) => JSON.parse(readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8"));
const rules = compileRuleset(read("../../../rules/production-0.1.0/ruleset.json"));
const content = compileContentBundle(read("../../../content/alpha-0.4.0/bundle.json"));

describe("content/ruleset compatibility", () => {
  it("accepts the migrated retained roster", () => {
    expect(() => validateContentAgainstRuleset(content, rules)).not.toThrow();
    expect(content.version).toBe("alpha-0.4.0");
    expect(content.manifest.shopHeroCount).toBe(20);
    expect(content.manifest.uniqueItemCount).toBe(6);
  });

  it("keeps every Adventure enemy in enemy territory", () => {
    for (const encounter of content.encounters) {
      for (const enemy of encounter.enemy_composition ?? []) {
        expect(Math.floor(enemy.position / rules.board.columns)).toBeLessThanOrEqual(rules.board.enemyRows.end);
      }
    }
  });

  it("rejects an item slot cost above the per-hero limit", () => {
    const invalid = structuredClone(content) as typeof content;
    const item = invalid.normalItems[0] as unknown as Record<string, unknown>;
    item.slot_cost = 3;
    expect(() => validateContentAgainstRuleset(invalid, rules)).toThrow("item slot cost exceeds ruleset limit");
  });
});
```

- [ ] **Step 2: Run the test and verify failure**

```bash
pnpm --filter @auto-battler/game-core test -- test/compatibility/content-ruleset.test.ts
```

Expected: FAIL because `alpha-0.4.0` and the validator do not exist.

- [ ] **Step 3: Implement the deterministic content migration script**

Create `tools/migrate-alpha-board-to-4x8.mjs`:

```js
import { readFile, writeFile, mkdir } from "node:fs/promises";

const sourcePath = new URL("../content/alpha-0.3.0/bundle.json", import.meta.url);
const outputDir = new URL("../content/alpha-0.4.0/", import.meta.url);
const outputPath = new URL("bundle.json", outputDir);
const source = JSON.parse(await readFile(sourcePath, "utf8"));

function migratePosition(position) {
  if (!Number.isInteger(position) || position < 0 || position >= 12) {
    throw new Error(`Legacy enemy position is invalid: ${position}`);
  }
  return Math.floor(position / 3) * 4 + (position % 3);
}

const migrated = {
  ...source,
  version: "alpha-0.4.0",
  encounters: source.encounters.map((encounter) => ({
    ...encounter,
    ...(encounter.enemy_composition === undefined ? {} : {
      enemy_composition: encounter.enemy_composition.map((enemy) => ({
        ...enemy,
        position: migratePosition(enemy.position),
      })),
    }),
  })),
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(migrated, null, 2)}\n`);
```

Run it once:

```bash
node tools/migrate-alpha-board-to-4x8.mjs
```

Review the diff and confirm only `version` and encounter positions changed.

- [ ] **Step 4: Implement compatibility validation**

Create `game-core/src/compatibility/content-ruleset.ts` with:

```ts
import type { CompiledContentBundle } from "../content/types.js";
import type { CompiledRuleset } from "../rules/types.js";

export function validateContentAgainstRuleset(content: CompiledContentBundle, rules: CompiledRuleset): void {
  if (content.manifest.shopHeroCount !== 20) throw new Error("production roster must contain H01-H20");
  if (content.manifest.uniqueItemCount !== 6) throw new Error("production rules require U01-U06");

  const playerCellCount = rules.board.columns * (rules.board.playerRows.end - rules.board.playerRows.start + 1);
  for (const trait of content.traitsById.values()) {
    const breakpoints = Array.isArray(trait.breakpoints) ? trait.breakpoints : [];
    for (const breakpoint of breakpoints) {
      if (typeof breakpoint === "object" && breakpoint !== null
        && typeof (breakpoint as Record<string, unknown>).count === "number"
        && (breakpoint as Record<string, unknown>).count as number > Math.min(8, playerCellCount)) {
        throw new Error(`trait breakpoint exceeds deployment cap: ${trait.id}`);
      }
    }
  }

  for (const item of [...content.normalItems, ...content.uniqueItems]) {
    if (typeof item.slot_cost !== "number" || item.slot_cost > rules.roster.maxItemsPerHero) {
      throw new Error(`item slot cost exceeds ruleset limit: ${item.id}`);
    }
  }

  for (const encounter of content.encounters) {
    for (const enemy of encounter.enemy_composition ?? []) {
      const row = Math.floor(enemy.position / rules.board.columns);
      if (row < rules.board.enemyRows.start || row > rules.board.enemyRows.end) {
        throw new Error(`encounter enemy outside enemy territory: ${encounter.id}`);
      }
    }
  }
}
```

Export it from `game-core/src/index.ts`.

- [ ] **Step 5: Update bundle and golden tests**

Point the retained-roster content tests at `alpha-0.4.0`, add assertions for exact hero IDs H01–H20 and Unique IDs U01–U06, and intentionally replace the golden digest with the newly printed digest after reviewing the content diff.

- [ ] **Step 6: Run content and compatibility suites**

```bash
pnpm --filter @auto-battler/game-core test -- test/content test/compatibility/content-ruleset.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add tools/migrate-alpha-board-to-4x8.mjs content/alpha-0.4.0 game-core/src/compatibility game-core/src/index.ts game-core/test/content game-core/test/compatibility
git commit -m "feat: migrate retained content to four-column board"
```

---

### Task 6: Make Adventure progression, shop, economy, item, and Unique rules injectable

**Files:**
- Create: `server/src/application/progression.ts`
- Modify: `server/src/application/shop-pool.ts`
- Modify: `server/src/application/run-commands.ts`
- Modify: `server/src/application/round-lifecycle.ts`
- Modify: `server/test/shop-pool.test.ts`
- Modify: `server/test/run-commands.test.ts`
- Modify: `server/test/reward-selection.test.ts`

**Interfaces:**
- Produces: `RunCommandDependencies { repository, shopGenerator?, ruleset }`
- Changes: `createRun(input, dependencies, setup?)`
- Changes: `applyRunCommand(input, dependencies)`
- Produces: `progressionForRun(run, ruleset)` and `buyExperience(progression, ruleset)`
- Changes: shop pool functions consume `ruleset.shop`
- Changes: round lifecycle functions consume `ruleset.adventure`

- [ ] **Step 1: Add a server rules fixture**

At the top of affected server tests, load:

```ts
import { compileRuleset } from "@auto-battler/game-core";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const rules = compileRuleset(JSON.parse(readFileSync(
  fileURLToPath(new URL("../../rules/production-0.1.0/ruleset.json", import.meta.url)),
  "utf8",
)));
```

- [ ] **Step 2: Write failing rules-driven run tests**

Add to `server/test/run-commands.test.ts`:

```ts
it("creates a five-slot Adventure shop and sixteen-cell player board from the ruleset", async () => {
  const module = await import("../src/application/run-commands.js");
  const repository = module.createInMemoryRunRepository();
  const shopGenerator = {
    createPool: () => ({ runSeed: "00".repeat(32), heroes: {} }),
    rollShop: () => Array.from({ length: rules.shop.slotCount }, (_, index) => ({ heroId: `H${String(index + 1).padStart(2, "0")}`, cost: 1 })),
  };

  const run = await module.createRun(
    { id: "run-rules", tenantId: "tenant-a", contentVersion: "alpha-0.4.0", rulesetVersion: rules.version },
    { repository, shopGenerator, ruleset },
    { runSeed: "00".repeat(32), uniqueItemIds: ["U01", "U02", "U03", "U04", "U05", "U06"] },
  );

  expect(run.shop).toHaveLength(5);
  expect(run.board).toHaveLength(16);
  expect(run).toMatchObject({ gold: 8, health: 30, level: 3, rulesetVersion: rules.version });
});

it("uses global player cells sixteen through thirty-one for move commands", async () => {
  const module = await import("../src/application/run-commands.js");
  const repository = module.createInMemoryRunRepository();
  await repository.save({
    id: "run-move-4x8", tenantId: "tenant-a", contentVersion: "alpha-0.4.0", rulesetVersion: rules.version,
    state: "PREPARE", round: 1, revision: 0, gold: 8, level: 3, experience: 0,
    commandResponses: {}, bench: [{ instanceId: "h1", heroId: "H01", cost: 1 }], board: Array(16).fill(null),
  });

  await module.applyRunCommand({
    actorId: "actor-a", tenantId: "tenant-a", runId: "run-move-4x8", commandId: "move", expectedRevision: 0,
    type: "MOVE_HERO", heroInstanceId: "h1", destination: 16,
  }, { repository, ruleset: rules });

  await expect(repository.get("run-move-4x8", "tenant-a")).resolves.toMatchObject({
    board: [expect.objectContaining({ instanceId: "h1" })],
  });
});
```

- [ ] **Step 3: Run the server tests and verify failure**

```bash
pnpm --filter @auto-battler/server test -- test/run-commands.test.ts test/shop-pool.test.ts test/reward-selection.test.ts
```

Expected: FAIL because run APIs and shop/lifecycle rules are still hardcoded.

- [ ] **Step 4: Extract progression logic**

Create `server/src/application/progression.ts`:

```ts
import type { CompiledRuleset } from "@auto-battler/game-core";
import type { RunRecord } from "./run-commands.js";

export interface RunProgression {
  readonly level: number;
  readonly experience: number;
  readonly experienceToNext: number;
  readonly boardCap: number;
}

function ruleForLevel(ruleset: CompiledRuleset, level: number) {
  const rule = ruleset.progression.levels.find((candidate) => candidate.level === level);
  if (rule === undefined) throw new Error("GAME_RULE_VIOLATION");
  return rule;
}

export function progressionForRun(
  run: Pick<RunRecord, "level" | "experience">,
  ruleset: CompiledRuleset,
): RunProgression {
  const level = run.level ?? ruleset.progression.initialLevel;
  const experience = run.experience ?? 0;
  const levelRule = ruleForLevel(ruleset, level);
  if (!Number.isSafeInteger(experience) || experience < 0
    || (levelRule.xpToNext === 0 ? experience !== 0 : experience >= levelRule.xpToNext)) {
    throw new Error("GAME_RULE_VIOLATION");
  }
  return Object.freeze({ level, experience, experienceToNext: levelRule.xpToNext, boardCap: levelRule.boardCap });
}

export function buyExperience(progression: RunProgression, ruleset: CompiledRuleset) {
  let level = progression.level;
  let experience = progression.experience + ruleset.progression.xpPerPurchase;
  while (level < ruleset.progression.maxLevel) {
    const current = ruleForLevel(ruleset, level);
    if (experience < current.xpToNext) break;
    experience -= current.xpToNext;
    level += 1;
  }
  return Object.freeze({ level, experience: level === ruleset.progression.maxLevel ? 0 : experience });
}
```

- [ ] **Step 5: Replace positional run dependencies with one dependency object**

In `server/src/application/run-commands.ts` add:

```ts
import type { CompiledRuleset } from "@auto-battler/game-core";

export interface RunCommandDependencies {
  readonly repository: RunRepository;
  readonly shopGenerator?: ShopGenerator;
  readonly ruleset: CompiledRuleset;
}
```

Change signatures to:

```ts
export async function createRun(
  input: CreateRunInput,
  dependencies: RunCommandDependencies,
  setup?: CreateRunSetup,
): Promise<RunRecord>;

export async function applyRunCommand(
  input: RunCommandInput,
  dependencies: RunCommandDependencies,
): Promise<RunCommandResult>;
```

Add `rulesetVersion: string` to `CreateRunInput` and `RunRecord`. Remove `ALPHA_RULESET_VERSION`, level/shop/board/item constants, and derive:

- `Array(playerBoardCellCount(ruleset.board)).fill(null)` → 16 cells.
- player destination offset from `playerStartCell(ruleset.board)` → 16.
- bench capacity from `ruleset.roster.benchSlots` → 8.
- item capacity from `ruleset.roster.maxItemsPerHero` → 2.
- team Unique limit from `ruleset.roster.maxUniquePerTeam` → 1.
- refresh cost and XP cost from ruleset.
- level and board cap from `progression.ts`.
- locked snapshot `rulesetVersion` from the run, never a constant.

- [ ] **Step 6: Make shop pool rules-driven**

Change signatures in `server/src/application/shop-pool.ts`:

```ts
export function createShopPool(
  content: Pick<CompiledContentBundle, "heroesById">,
  runSeed: string,
  rules: CompiledRuleset["shop"],
): ShopPool;

export function rollShop(
  pool: ShopPool,
  level: number,
  stream: string,
  rules: CompiledRuleset["shop"],
): ShopSlot[];

export function shopOddsForLevel(
  level: number,
  rules: CompiledRuleset["shop"],
): ShopTierOdds;
```

Remove `COPIES_BY_RARITY`, `TIER_ODDS_BY_LEVEL`, and hardcoded `5`. Read all values from `rules`.

- [ ] **Step 7: Make Adventure round lifecycle rules-driven**

Change signatures:

```ts
recordResolvedCombat(run, result, ruleset)
attachContentRoundRewards(run, content, ruleset)
claimResolvedRoundReward(run, selections, ruleset)
```

Derive loss damage, initial health fallback, Unique reveal round, base income, and final Adventure round from `ruleset.adventure`. Remove `BASE_WIN_GOLD`, literal round `4`, literal round `8`, and literal health `30` from lifecycle logic.

- [ ] **Step 8: Update all server tests/call sites**

Every `createRun` and `applyRunCommand` call must pass `{ repository, shopGenerator, ruleset }` or `{ repository, ruleset }`. Every lifecycle test must pass `rules`.

- [ ] **Step 9: Run focused and full server suites**

```bash
pnpm --filter @auto-battler/server test -- test/run-commands.test.ts test/shop-pool.test.ts test/reward-selection.test.ts
pnpm --filter @auto-battler/server test
pnpm --filter @auto-battler/server typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src/application/progression.ts server/src/application/shop-pool.ts server/src/application/run-commands.ts server/src/application/round-lifecycle.ts server/test
git commit -m "refactor: drive adventure rules from compiled ruleset"
```

---

### Task 7: Inject ruleset through runtime, HTTP, and combat resolution

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
- Produces: `ImmutableRulesetRepository.getByVersion(version)`
- Adds: `RULESET_BUNDLE_PATH`
- Adds: `POST /v1/runs` body field `ruleset_version`
- Adds: `GET /v1/rulesets/:rulesetVersion/manifest`
- Adds: `CombatSnapshot.board`

- [ ] **Step 1: Write HTTP ruleset tests**

Add to `server/test/http.test.ts`:

```ts
it("serves a canonical ruleset manifest and requires its version when creating a run", async () => {
  const app = await createRuntimeApp({
    contentPath: contentPath("alpha-0.4.0"),
    rulesetPath: productionRulesetPath,
  });

  const manifest = await app.inject({ method: "GET", url: "/v1/rulesets/production-rules-0.1.0/manifest" });
  expect(manifest.statusCode).toBe(200);
  expect(manifest.json().data).toMatchObject({
    ruleset_version: "production-rules-0.1.0",
    board: { columns: 4, rows: 8 },
    shop_slot_count: 5,
  });

  const created = await app.inject({
    method: "POST", url: "/v1/runs",
    payload: { id: "run-http-rules", content_version: "alpha-0.4.0", ruleset_version: "production-rules-0.1.0" },
  });
  expect(created.statusCode).toBe(201);
  expect(created.json().data).toMatchObject({ rulesetVersion: "production-rules-0.1.0", board: expect.any(Array) });
});
```

- [ ] **Step 2: Write a combat snapshot geometry test**

Add to `server/test/combat-snapshot.test.ts`:

```ts
it("maps the sixteen local player cells onto global cells sixteen through thirty-one", () => {
  const board = Array(16).fill(null);
  board[0] = { instanceId: "front", heroId: "H01", cost: 1, stars: 1 };
  board[15] = { instanceId: "rear", heroId: "H03", cost: 1, stars: 1 };
  const snapshot = buildCombatSnapshot({ content, ruleset: rules, lockedSnapshot: locked(board), combatId: "c", combatSeed: "00".repeat(16) });
  expect(snapshot.board).toEqual(rules.board);
  expect(snapshot.units.filter((unit) => unit.side === "player").map((unit) => unit.position).sort((a, b) => a - b)).toEqual([16, 31]);
});
```

- [ ] **Step 3: Run focused tests and verify failure**

```bash
pnpm --filter @auto-battler/server test -- test/http.test.ts test/combat-snapshot.test.ts test/runtime.test.ts
```

Expected: FAIL because ruleset runtime/repository/HTTP fields are absent.

- [ ] **Step 4: Load the ruleset in runtime**

In `server/src/runtime.ts`:

```ts
import { compileRuleset, type CompiledRuleset } from "@auto-battler/game-core";

export interface RuntimeOptions {
  readonly contentPath: string;
  readonly rulesetPath: string;
  // existing fields...
}

export function loadCompiledRuleset(rulesetPath: string): CompiledRuleset {
  return compileRuleset(JSON.parse(readFileSync(rulesetPath, "utf8")));
}
```

Create static content and ruleset repositories and validate the loaded content with `validateContentAgainstRuleset` during startup. `startRuntimeServer` must fail before listening when compatibility fails.

In `server/src/main.ts`, resolve `RULESET_BUNDLE_PATH` with default candidates for `rules/production-0.1.0/ruleset.json`; change the default host to `0.0.0.0` for container/device access while preserving explicit `HOST` override.

- [ ] **Step 5: Refactor HTTP dependencies to an object**

Replace positional `createHttpApp` arguments with:

```ts
export interface HttpAppDependencies {
  readonly authContext: { actorId: string; tenantId: string };
  readonly repository: RunRepository;
  readonly shopGenerator: ShopGenerator;
  readonly contentRepository: ContentManifestRepository;
  readonly rulesetRepository: ImmutableRulesetRepository;
}

export function createHttpApp(dependencies: HttpAppDependencies) { /* routes */ }
```

`POST /v1/runs` resolves both versions, validates compatibility, and calls `createRun` with ruleset dependencies. `toPublicRunView` includes `rulesetVersion`.

Add `GET /v1/rulesets/:rulesetVersion/manifest` returning only:

```json
{
  "ruleset_version": "production-rules-0.1.0",
  "ruleset_hash": "...",
  "tick_rate": 20,
  "max_combat_ticks": 700,
  "board": { "columns": 4, "rows": 8, "enemy_rows": { "start": 0, "end": 3 }, "player_rows": { "start": 4, "end": 7 } },
  "bench_slots": 8,
  "shop_slot_count": 5,
  "max_level": 9
}
```

- [ ] **Step 6: Make combat snapshot construction rules-aware**

Change `BuildCombatSnapshotInput` to contain `ruleset: CompiledRuleset` and remove the separate `rulesetVersion` argument. Map player local index using:

```ts
const playerOrigin = playerStartCell(input.ruleset.board);
position: playerOrigin + localPosition;
```

Return:

```ts
{
  combatId,
  contentVersion,
  rulesetVersion: input.ruleset.version,
  board: input.ruleset.board,
  combatSeed,
  maxTicks: input.ruleset.maxCombatTicks,
  defenderSide: "enemy",
  units,
}
```

- [ ] **Step 7: Resolve the locked ruleset by version**

Extend `ResolveRunCombatDependencies` with `rulesetRepository`. Resolve `run.lockedSnapshot.rulesetVersion`, verify it equals `run.rulesetVersion`, validate content/rules compatibility, and pass the compiled ruleset through `resolveContentCombat`, `recordResolvedCombat`, and `attachContentRoundRewards`.

- [ ] **Step 8: Update client API request shape fixture tests**

Server HTTP tests and Godot request tests must expect `ruleset_version` when creating a run. Missing or unknown ruleset version returns `RULESET_VERSION_NOT_FOUND` with HTTP 404.

- [ ] **Step 9: Run server suites**

```bash
pnpm --filter @auto-battler/server test
pnpm --filter @auto-battler/server typecheck
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add server/src server/test
git commit -m "feat: inject canonical ruleset through adventure runtime"
```

---

### Task 8: Generate and load a client-safe rules projection

**Files:**
- Create: `tools/export-client-ruleset.mjs`
- Create: `client-godot/assets/rules/production-rules-0.1.0.json`
- Create: `client-godot/scripts/rules/ruleset_catalog.gd`
- Create: `client-godot/scripts/rules/board_layout.gd`
- Create: `client-godot/test/ruleset_catalog_test.gd`
- Create: `client-godot/test/board_layout_test.gd`
- Modify: `package.json`

**Interfaces:**
- Produces: reproducible client projection with `rulesetVersion` and `rulesetHash`
- Produces: `RulesetCatalog.data()`, `board_columns()`, `board_rows()`, `player_start_cell()`, `player_board_cell_count()`, `shop_slot_count()`, `bench_slots()`, `max_level()`
- Produces: `BoardLayout.cell_center(board_rect, grid_index, columns, rows)`

- [ ] **Step 1: Write the Godot rules catalog test**

Create `client-godot/test/ruleset_catalog_test.gd`:

```gdscript
extends SceneTree

const RulesetCatalog = preload("res://scripts/rules/ruleset_catalog.gd")
var failed := false

func _init() -> void:
  _expect(RulesetCatalog.ruleset_version() == "production-rules-0.1.0", "ruleset version must match authored source")
  _expect(RulesetCatalog.board_columns() == 4 and RulesetCatalog.board_rows() == 8, "client board must be 4x8")
  _expect(RulesetCatalog.player_start_cell() == 16 and RulesetCatalog.player_board_cell_count() == 16, "player half must be global cells 16..31")
  _expect(RulesetCatalog.shop_slot_count() == 5 and RulesetCatalog.bench_slots() == 8, "shop and bench cardinality must match rules")
  _expect(RulesetCatalog.max_level() == 9, "client max level must be nine")
  quit(1 if failed else 0)

func _expect(condition: bool, message: String) -> void:
  if not condition:
    failed = true
    push_error(message)
```

Create `client-godot/test/board_layout_test.gd`:

```gdscript
extends SceneTree
const BoardLayout = preload("res://scripts/rules/board_layout.gd")
var failed := false

func _init() -> void:
  var rect := Rect2(40.0, 160.0, 1000.0, 960.0)
  _expect(BoardLayout.cell_center(rect, 0, 4, 8) == Vector2(165.0, 220.0), "cell zero center must be derived from the rect")
  _expect(BoardLayout.cell_center(rect, 31, 4, 8) == Vector2(915.0, 1060.0), "last cell center must remain inside the board")
  quit(1 if failed else 0)

func _expect(condition: bool, message: String) -> void:
  if not condition:
    failed = true
    push_error(message)
```

- [ ] **Step 2: Run both Godot tests and verify failure**

```powershell
& $godot --headless --path client-godot --script res://test/ruleset_catalog_test.gd
& $godot --headless --path client-godot --script res://test/board_layout_test.gd
```

Expected: both fail because scripts/generated JSON do not exist.

- [ ] **Step 3: Implement the deterministic exporter**

Create `tools/export-client-ruleset.mjs`. It must load the built `game-core` package, compile the root ruleset, and project only:

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

Support `--check`: compare the canonical generated text with the committed file and exit `1` with `Client rules projection is stale` on mismatch. Without `--check`, write the file with two-space JSON plus final newline.

- [ ] **Step 4: Generate the committed client rules projection**

```bash
pnpm --filter @auto-battler/game-core build
node tools/export-client-ruleset.mjs
```

Expected: creates `client-godot/assets/rules/production-rules-0.1.0.json`.

- [ ] **Step 5: Implement `RulesetCatalog`**

Create `client-godot/scripts/rules/ruleset_catalog.gd` with a static cached JSON load, strict dictionary/integer checks, and the exact accessors named above. Invalid or missing rules data must `push_error` and return no silent Alpha fallback.

The public shape is:

```gdscript
class_name RulesetCatalog
extends RefCounted

const PATH := "res://assets/rules/production-rules-0.1.0.json"
static var _cached: Dictionary = {}

static func data() -> Dictionary
static func ruleset_version() -> String
static func ruleset_hash() -> String
static func board_columns() -> int
static func board_rows() -> int
static func player_start_cell() -> int
static func player_board_cell_count() -> int
static func shop_slot_count() -> int
static func bench_slots() -> int
static func max_level() -> int
```

- [ ] **Step 6: Implement `BoardLayout`**

Create `client-godot/scripts/rules/board_layout.gd`:

```gdscript
class_name BoardLayout
extends RefCounted

static func cell_center(board_rect: Rect2, grid_index: int, columns: int, rows: int) -> Vector2:
  assert(columns > 0 and rows > 0)
  assert(grid_index >= 0 and grid_index < columns * rows)
  var cell_size := Vector2(board_rect.size.x / columns, board_rect.size.y / rows)
  var column := grid_index % columns
  var row := grid_index / columns
  return board_rect.position + Vector2((column + 0.5) * cell_size.x, (row + 0.5) * cell_size.y)
```

- [ ] **Step 7: Add root scripts**

Modify `package.json`:

```json
{
  "scripts": {
    "rules:export": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs",
    "rules:check": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs --check"
  }
}
```

Merge these entries with existing scripts; do not replace `typecheck`, `test`, or `check` yet.

- [ ] **Step 8: Run exporter and Godot tests**

```bash
pnpm run rules:check
```

```powershell
& $godot --headless --path client-godot --script res://test/ruleset_catalog_test.gd
& $godot --headless --path client-godot --script res://test/board_layout_test.gd
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add tools/export-client-ruleset.mjs client-godot/assets/rules client-godot/scripts/rules client-godot/test/ruleset_catalog_test.gd client-godot/test/board_layout_test.gd package.json
git commit -m "feat: generate canonical client rules projection"
```

---

### Task 9: Migrate Godot Adventure geometry and invalidate incompatible local saves

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
- Modify: `client-godot/test/formation_controller_test.gd`
- Modify: `client-godot/test/run_state_test.gd`
- Modify: `client-godot/test/prepare_screen_test.gd`
- Modify: `client-godot/test/battle_controller_test.gd`
- Modify: `client-godot/test/main_scene_smoke_test.gd`

**Interfaces:**
- Adventure public run view includes `rulesetVersion`
- Create-run request includes `ruleset_version`
- Formation destinations are bench `0..7` or global player cells `16..31`
- Local board array contains 16 entries
- Local save schema becomes version 2 and rejects schema 1

- [ ] **Step 1: Update formation tests first**

In `client-godot/test/formation_controller_test.gd`, assert:

```gdscript
_expect(controller.request_move("hero-1", 16, "PREPARE"), "first player board cell must be legal")
_expect(controller.request_move("hero-1", 31, "PREPARE"), "last player board cell must be legal")
_expect(not controller.request_move("hero-1", 12, "PREPARE"), "legacy 3x8 player cell must be rejected")
_expect(not controller.request_move("hero-1", 32, "PREPARE"), "cell past the board must be rejected")
```

Update run-state and prepare fixtures to use sixteen board entries and `rulesetVersion: "production-rules-0.1.0"`.

- [ ] **Step 2: Add request-shape and save-version tests**

Update the API client test to expect:

```gdscript
api.create_run_request("run-1", "alpha-0.4.0", "production-rules-0.1.0").body
```

to decode as:

```json
{"id":"run-1","content_version":"alpha-0.4.0","ruleset_version":"production-rules-0.1.0"}
```

Update `local_run_store_test.gd` so a schema-1 envelope returns `{}`, while a schema-2 view with matching content/ruleset versions and a 16-cell board round-trips.

- [ ] **Step 3: Run focused Godot tests and verify failure**

```powershell
& $godot --headless --path client-godot --script res://test/formation_controller_test.gd
& $godot --headless --path client-godot --script res://test/run_state_test.gd
& $godot --headless --path client-godot --script res://test/local_run_store_test.gd
& $godot --headless --path client-godot --script res://test/prepare_screen_test.gd
```

Expected: FAIL on legacy ranges/board cardinality/request shape.

- [ ] **Step 4: Replace client board constants with the rules catalog**

In the listed Godot scripts:

- Remove independent `BOARD_COLUMNS`, `BOARD_ROWS`, player-row, and destination constants.
- Use `RulesetCatalog.board_columns()`, `board_rows()`, `player_start_cell()`, and `player_board_cell_count()`.
- Use `BoardLayout.cell_center(...)` for combat actor/monster positions.
- Use 4 enemy rows and 4 player rows in Prepare.
- Derive the 16 local board cells from `player_board_cell_count()`.
- Keep the existing visual shell; do not redesign panels in this task.

For `formation_controller.gd`, `_is_formation_destination` becomes:

```gdscript
func _is_formation_destination(destination: int) -> bool:
  var bench_legal := destination >= 0 and destination < RulesetCatalog.bench_slots()
  var player_start := RulesetCatalog.player_start_cell()
  var board_legal := destination >= player_start and destination < player_start + RulesetCatalog.player_board_cell_count()
  return bench_legal or board_legal
```

- [ ] **Step 5: Update API client and run state**

Change:

```gdscript
func create_run_request(run_id: String, content_version: String, ruleset_version: String) -> Dictionary
func create_run(run_id: String, content_version: String, ruleset_version: String) -> void
```

Store `rulesetVersion` in `run_state.gd`. `battle_controller.gd` uses constants only for current version IDs:

```gdscript
const CONTENT_VERSION := "alpha-0.4.0"
const RULESET_VERSION := "production-rules-0.1.0"
```

The version strings may later move to Boot/content negotiation; Gate 0 requires explicit values, not silent defaults.

- [ ] **Step 6: Invalidate incompatible local saves explicitly**

In `local_run_store.gd`:

- Set `SCHEMA_VERSION := 2`.
- Add `rulesetVersion` to `PUBLIC_FIELDS`.
- Require content version `alpha-0.4.0`, ruleset version `production-rules-0.1.0`, and board length 16.
- Return `{}` for schema 1; do not reinterpret a 12-cell save as a 16-cell save.

- [ ] **Step 7: Migrate replay fixture positions**

Update `client-godot/fixtures/combat-replay.json` to include ruleset metadata and valid 0–31 positions. Preserve event order and semantics; map legacy cells using the same row-preserving formula used by the content migration.

- [ ] **Step 8: Run all Godot tests**

```powershell
Get-ChildItem client-godot/test/*_test.gd | ForEach-Object {
  & $godot --headless --path client-godot --script "res://test/$($_.Name)"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: every test exits `0`.

- [ ] **Step 9: Commit**

```bash
git add client-godot/scripts client-godot/fixtures client-godot/test
git commit -m "refactor: align godot adventure with four-by-eight rules"
```

---

### Task 10: Add cross-layer drift checks and canonical documentation

**Files:**
- Modify: `package.json`
- Modify: `.github/workflows/ci.yml`
- Modify: `README.md`
- Modify: `docs/GAME_RULES.md`
- Modify: `docs/ARCHITECTURE.md`
- Create: `docs/evidence/gate-0-rules-foundation.md`

**Interfaces:**
- Produces: root `pnpm run rules:check`
- Produces: root `pnpm run check` that fails on stale client rules
- Produces: Gate 0 evidence checklist with commands, not unverified claims

- [ ] **Step 1: Make rules drift part of the root check**

Modify root scripts so:

```json
{
  "scripts": {
    "rules:export": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs",
    "rules:check": "pnpm --filter @auto-battler/game-core build && node tools/export-client-ruleset.mjs --check",
    "typecheck": "pnpm --recursive run typecheck",
    "test": "pnpm --recursive run test",
    "check": "pnpm run rules:check && pnpm run typecheck && pnpm run test"
  }
}
```

- [ ] **Step 2: Update CI**

In `.github/workflows/ci.yml`, keep frozen install and run `pnpm run check`. Add a separate named step `Verify generated rules projection` running `pnpm run rules:check` before the full check so drift failures are immediately visible.

- [ ] **Step 3: Replace conflicting game rules documentation**

Rewrite the board/shop/progression sections of `docs/GAME_RULES.md` to state:

- Canonical source is `rules/production-0.1.0/ruleset.json`.
- Board is 4×8 with global player cells 16–31.
- Shop is five slots.
- Levels are 3–9 with deployment cap up to 8.
- XP purchase is enabled and rules-driven.
- Adventure-specific health/income/round values come from the ruleset.
- The document explains formulas and invariants but does not duplicate mutable balance tables beyond examples.

Update `docs/ARCHITECTURE.md` with the version hierarchy and ruleset repository/injection flow.

- [ ] **Step 4: Update README run instructions**

Document:

```powershell
$env:CONTENT_BUNDLE_PATH = "content/alpha-0.4.0/bundle.json"
$env:RULESET_BUNDLE_PATH = "rules/production-0.1.0/ruleset.json"
pnpm --filter @auto-battler/server build
pnpm --filter @auto-battler/server start
```

State that desktop uses `127.0.0.1`, Android emulator uses `10.0.2.2`, and physical/staging endpoints are Gate 1 Boot configuration. Do not claim device playability in Gate 0.

- [ ] **Step 5: Create the evidence template with exact checks**

Create `docs/evidence/gate-0-rules-foundation.md`:

```markdown
# Gate 0 Rules Foundation Evidence

## Required automated commands

- `pnpm run rules:check`
- `pnpm run typecheck`
- `pnpm run test`
- all `client-godot/test/*_test.gd` headless tests
- `git diff --check`

## Required invariants

- ruleset version/hash is identical in server and generated Godot projection
- board is 4×8 in game-core, server public run, replay fixtures, and Godot
- player board storage is 16 cells; global player positions are 16–31
- shop is five slots
- maximum level is 9 and deployment cap is 8
- H01–H20 and U01–U06 remain present
- `alpha-0.3.0` is unchanged; migrated content is `alpha-0.4.0`

Command output is attached to the Gate 0 implementation review; this document does not substitute for fresh output.
```

- [ ] **Step 6: Run documentation/drift checks**

```bash
pnpm run rules:check
git diff --check
git grep -nE 'BOARD_CELL_COUNT = 24|/ 3|% 3|Array\(12\)|destination - 12|MAX_PLAYER_BOARD_CAP = 6|slotCount = 4' -- game-core/src server/src client-godot/scripts || true
```

Review every grep result. A result is allowed only in migration tests/scripts explicitly describing legacy 3×8 data.

- [ ] **Step 7: Commit**

```bash
git add package.json .github/workflows/ci.yml README.md docs/GAME_RULES.md docs/ARCHITECTURE.md docs/evidence/gate-0-rules-foundation.md
git commit -m "docs: lock canonical production rules workflow"
```

---

### Task 11: Execute the full Gate 0 acceptance verification

**Files:**
- Modify only if verification reveals a defect in a prior task.
- Update: `docs/evidence/gate-0-rules-foundation.md` only with immutable references to attached CI/review evidence, not pasted volatile success counts.

**Interfaces:**
- Produces: accepted Gate 0 commit and tag `gate-0-rules-foundation`
- Unlocks: Gate 1 Adventure/client rebuild planning

- [ ] **Step 1: Run a clean install and complete TypeScript verification**

```bash
rm -rf node_modules game-core/node_modules server/node_modules game-core/dist server/dist
corepack enable
pnpm install --frozen-lockfile
pnpm run rules:check
pnpm run typecheck
pnpm run test
```

Expected: every command exits `0`; no stale generated projection.

- [ ] **Step 2: Run every Godot headless test**

```powershell
Get-ChildItem client-godot/test/*_test.gd | Sort-Object Name | ForEach-Object {
  Write-Host "RUN $($_.Name)"
  & $godot --headless --path client-godot --script "res://test/$($_.Name)"
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}
```

Expected: all scripts exit `0`.

- [ ] **Step 3: Run the Adventure API smoke flow**

Start the server with explicit bundles:

```bash
CONTENT_BUNDLE_PATH=content/alpha-0.4.0/bundle.json \
RULESET_BUNDLE_PATH=rules/production-0.1.0/ruleset.json \
HOST=127.0.0.1 PORT=3000 \
pnpm --filter @auto-battler/server start
```

From another shell:

```bash
curl -fsS http://127.0.0.1:3000/health
curl -fsS http://127.0.0.1:3000/v1/rulesets/production-rules-0.1.0/manifest
curl -fsS -X POST http://127.0.0.1:3000/v1/runs \
  -H 'Content-Type: application/json' \
  -d '{"id":"gate-0-smoke","content_version":"alpha-0.4.0","ruleset_version":"production-rules-0.1.0"}'
```

Expected: health is OK; rules manifest reports 4×8 and five shop slots; created run reports a 16-cell board, five-slot shop, level 3, 8 gold, and 30 health.

- [ ] **Step 4: Run drift and whitespace checks**

```bash
git diff --check
pnpm run rules:check
git status --short
```

Expected: no whitespace errors, generated projection is current, and the worktree contains only intentional evidence updates.

- [ ] **Step 5: Verify immutable version boundaries**

```bash
git diff --exit-code alpha-pve-0.3.0-baseline -- content/alpha-0.3.0/bundle.json
git show alpha-pve-0.3.0-baseline:content/alpha-0.3.0/bundle.json | sha256sum
git show HEAD:content/alpha-0.3.0/bundle.json | sha256sum
```

Expected: no diff and identical hashes for `alpha-0.3.0`.

- [ ] **Step 6: Request code review against the Gate 0 specification**

Review must explicitly inspect:

- no hidden three-column geometry in simulation/effects;
- no server default rules when ruleset lookup fails;
- no stale local save reinterpretation;
- content/rules compatibility checks;
- ruleset hash/projection drift protection;
- deterministic replay tests after hash changes.

Address approved review findings under the receiving-code-review workflow and rerun all affected verification.

- [ ] **Step 7: Tag the accepted gate**

Only after fresh verification and review:

```bash
git tag -a gate-0-rules-foundation HEAD -m "Accepted Gate 0 canonical production rules foundation"
git push origin gate-0-rules-foundation
```

- [ ] **Step 8: Final commit if evidence references changed**

```bash
git add docs/evidence/gate-0-rules-foundation.md
git commit -m "docs: record gate zero rules evidence"
```

If the evidence document did not change, do not create an empty commit.

---

## Gate 0 self-review checklist

- Spec coverage: board, shop, level, economy, item, Unique, version locking, content migration, server injection, client projection, save invalidation, CI drift, and verification are assigned to explicit tasks.
- No plan step changes online matchmaking, ranked, identity, production art, or Google Play systems.
- All function/type names used by later tasks are defined before use.
- `alpha-0.3.0` remains immutable; the coordinate migration creates `alpha-0.4.0`.
- Production rules have no implicit default path inside gameplay use cases.
- Every code-changing task contains a failing-test step, minimal implementation boundary, passing-test step, and commit.
