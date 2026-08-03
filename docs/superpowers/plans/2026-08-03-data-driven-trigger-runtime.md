# Data-driven trigger runtime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Execute all Alpha normal-item and Unique combat triggers deterministically from content data.

**Architecture:** The content compiler normalizes legacy bundle trigger spellings into canonical `on_*` trigger definitions. The server adapter attaches immutable passives to snapshot units; the core kernel owns passive state, dispatch order, target selection, scaling, and emitted events.

**Tech Stack:** TypeScript strict mode, Vitest, existing `@auto-battler/game-core` deterministic kernel, Fastify server adapter.

## Global Constraints

- Never branch combat behavior on hero, item, Unique, or trait ID.
- Use fixed-point integer arithmetic only; `scales_with_max_hp` means per-thousand.
- Preserve deterministic canonical ordering and replay hashes.
- The client receives only combat events and cannot supply passives, seed, holder, or trigger state.
- Keep the user-owned dirty worktree uncommitted.

---

### Task 1: Canonical trigger content schema

**Files:**
- Modify: `game-core/src/content/types.ts`, `game-core/src/content/compiler.ts`, `game-core/src/index.ts`
- Modify: `game-core/test/content/compiler.test.ts`

**Interfaces:**
- Produces `CompiledCombatTrigger` and canonical `CompiledContentBundle` item trigger output.
- Consumes current `triggers`, `rules`, `when`, `threshold`, `cooldown_ticks`, and effect JSON.

- [x] **Step 1: Write failing compiler tests**

```ts
expect(compileContentBundle(bundle).normalItems.find((item) => item.id === "I10")?.triggers)
  .toMatchObject([{ trigger: "on_combat_start" }]);
expect(() => compileContentBundle(invalidHpTriggerBundle)).toThrow(/once_per_combat/i);
expect(() => compileContentBundle(invalidTriggerBundle)).toThrow(/trigger/i);
```

- [x] **Step 2: Run the focused test to verify it fails**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/compiler.test.ts`  
Expected: FAIL because trigger output/validation is absent.

- [x] **Step 3: Implement one-way normalization and validation**

```ts
type CombatTriggerKind = "on_combat_start" | "on_basic_attack" | "on_cast_resolve"
  | "on_hp_below" | "on_every_nth_basic_attack" | "on_damage_dealt";
interface CompiledCombatTrigger { readonly id: string; readonly trigger: CombatTriggerKind;
  readonly effects: readonly CombatEffect[]; readonly cooldownTicks?: number;
  readonly thresholdPercent?: number; readonly attackCount?: number;
  readonly oncePerCombat?: boolean; readonly basicOnly?: boolean; }
```

Map the seven legacy spellings defined in the approved design, reject unknown or incomplete definitions, and retain source order only within one owner.

- [x] **Step 4: Run focused compiler tests**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/content/compiler.test.ts test/content/alpha-bundle.test.ts`  
Expected: PASS.

### Task 2: Snapshot passives and max-HP effect scaling

**Files:**
- Modify: `game-core/src/effects/definitions.ts`, `game-core/src/simulation/kernel.ts`, `game-core/src/index.ts`
- Modify: `server/src/application/combat-snapshot.ts`
- Modify: `server/test/run-commands.test.ts`, `game-core/test/simulation/kernel.test.ts`

**Interfaces:**
- Produces `CombatPassive` on `CombatUnit` and `CombatEffect.scalesWithMaxHp`.
- Consumes canonical compiled item triggers and locked equipped items.

- [x] **Step 1: Write failing snapshot and kernel tests**

```ts
expect(snapshot.units.find((unit) => unit.id === "player:hero")?.passives)
  .toMatchObject([{ ownerId: "I10", trigger: "on_combat_start" }]);
expect(result.events.find((event) => event.type === "SHIELD_APPLIED")?.payload.amount)
  .toBe(12_000); // 12% of a 100_000 max-HP holder
```

- [x] **Step 2: Run focused tests to verify they fail**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts`  
Expected: FAIL because `passives` and max-HP scaling do not exist.

- [x] **Step 3: Add immutable passive input and canonical validation**

```ts
interface CombatPassive { readonly ownerId: string; readonly triggerId: string;
  readonly trigger: CombatTriggerKind; readonly effects?: readonly CombatEffect[];
  readonly lifestealPerThousand?: number; readonly cooldownTicks?: number;
  readonly thresholdPercent?: number; readonly attackCount?: number;
  readonly oncePerCombat?: boolean; readonly basicOnly?: boolean; }
```

Attach only items equipped on that exact locked hero. Sort passives by `(ownerId, triggerId)` and calculate max-HP-scaled effect values with `floor(maxHp * baseValue / 1000)`.

- [x] **Step 4: Run focused tests**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts && pnpm --filter @auto-battler/server exec vitest run test/run-commands.test.ts`  
Expected: PASS.

### Task 3: Deterministic kernel trigger dispatcher

**Files:**
- Modify: `game-core/src/simulation/kernel.ts`
- Modify: `game-core/test/simulation/kernel.test.ts`

**Interfaces:**
- Consumes `CombatUnit.passives`.
- Produces the ordinary existing effect events used by presentation and replay.

- [x] **Step 1: Write failing behavior tests**

```ts
expect(eventsOf(result, "SHIELD_APPLIED")).toHaveLength(1); // I10 at start
expect(eventsOf(result, "SLOW_APPLIED")).toHaveLength(1);   // I12 cooldown blocks repeat
expect(eventsOf(result, "STUN_APPLIED")).toHaveLength(1);   // U01 once at threshold
expect(result.resultHash).toBe(runHeadlessCombat(reorderedSnapshot).resultHash);
```

- [x] **Step 2: Verify tests fail**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts`  
Expected: FAIL because runtime passive state and dispatch are absent.

- [x] **Step 3: Implement dispatcher and passive runtime state**

```ts
interface PassiveRuntimeState { fired: boolean; nextEligibleTick: number; basicAttackCount: number; }
function dispatchPassives(kind: CombatTriggerKind, context: TriggerContext): void
```

Dispatch at combat start, after basic attack damage, after resolved cast, and after damage transitions. Enforce once/cooldown/counter gates before effects, preserve canonical ordering, suppress direct recursive re-entry, and use post-mitigation damage for lifesteal.

- [x] **Step 4: Verify focused kernel tests**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts`  
Expected: PASS.

### Task 4: Cover all Alpha item and Unique behaviors

**Files:**
- Modify: `game-core/test/simulation/kernel.test.ts`
- Modify: `server/test/run-commands.test.ts`

**Interfaces:**
- Consumes the real `content/alpha-0.3.0/bundle.json` through `compileContentBundle` and `buildCombatSnapshot`.

- [ ] **Step 1: Write real-content failing tests for I09–I12 and U01–U06**

```ts
expect(lifestealHp).toBeGreaterThan(beforeAttackHp);
expect(castBonusDamage).toBeGreaterThan(0);
expect(u02BonusDamageCount).toBe(1);
expect(u04HealAmount).toBe(12_000);
expect(u05Summons).toHaveLength(1);
expect(u06ShieldAmount).toBe(15_000);
```

- [ ] **Step 2: Run them and confirm each missing behavior**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts`  
Expected: failures identify any unmapped Alpha content behavior.

- [ ] **Step 3: Add only generic executor support required by failing tests**

Use the shared effect executor and target selector. Do not add item-ID conditions; represent lifesteal as its typed generic passive action and let U05 use the existing summon cap.

- [ ] **Step 4: Run real-content tests**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts && pnpm --filter @auto-battler/server exec vitest run test/run-commands.test.ts`  
Expected: PASS.

### Task 5: Trait passives, replay stress, and documentation

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`, `server/src/application/combat-snapshot.ts`, `game-core/test/simulation/kernel.test.ts`
- Modify: `docs/CONTENT_CONTRACT.md`, `docs/GAME_RULES.md`

**Interfaces:**
- Consumes active locked trait breakpoints.
- Produces trait passives using the same `CombatPassive` interface.

- [ ] **Step 1: Write failing tests for a dynamic trait trigger and 1,000 replayed snapshots**

```ts
expect(dynamicTraitEvents).toContainEqual(expect.objectContaining({ type: "STAT_MODIFIER_APPLIED" }));
for (let seed = 0; seed < 1_000; seed += 1) {
  expect(runHeadlessCombat(snapshot(seed)).resultHash).toBe(runHeadlessCombat(reordered(snapshot(seed))).resultHash);
}
```

- [ ] **Step 2: Verify the tests fail before dynamic trait attachment exists**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/simulation/kernel.test.ts`  
Expected: FAIL for the dynamic trait case.

- [ ] **Step 3: Attach content-defined active trait passives and document final canonical schema**

Add each existing plan-specified non-static trait effect as a canonical `triggers`
record in its trait breakpoint: Cat critical follow-ups; Dog first-low-HP and first-death
responses; Rabbit post-cast speed/dash; Cow first-low-HP shield; Mythic first-cast
rewards; Guardian rear-ally shield; Fighter third-hit and kill speed; Ranger
stationary interval stacks; Mage first-cast mana; Support heal/shield amplification
and post-heal damage reduction. Use only board holders counted in the locked
snapshot, preserve static modifiers, and document canonical trigger strings,
scaling, and event order.

- [ ] **Step 4: Run full verification**

Run: `pnpm run check`  
Expected: typechecks and all tests PASS.

Run: `& 'C:\Users\Admin\AppData\Local\Microsoft\WinGet\Packages\GodotEngine.GodotEngine_Microsoft.Winget.Source_8wekyb3d8bbwe\Godot_v4.7.1-stable_win64_console.exe' --headless --path 'D:\CODE\client-godot' --script 'res://test/main_scene_smoke_test.gd'`  
Expected: `PASS main_scene_smoke_test`.

## Self-review

- Compiler normalization/validation: Task 1.
- Snapshot boundary and max-HP scaling: Task 2.
- Ordered stateful dispatch and all Alpha effects: Tasks 3–4.
- Dynamic traits, replay stress, contract updates, and client smoke: Task 5.
- The plan uses the same `CombatPassive` naming and no placeholder steps; it intentionally excludes Android export and Supabase work because they are separate independent subsystems.
