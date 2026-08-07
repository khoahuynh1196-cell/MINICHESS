# Antigravity Offline-First Auto-Battler Implementation Plan

> **For agentic workers:** Execute this plan sequentially. Use plan/review mode before code changes, test-driven development for behavior changes, and verification-before-completion. Do not start a later mission while an earlier mission has a load-bearing failure.

**Goal:** Finish a strong offline-first auto-battler codebase: deterministic production 4×8 combat, complete Adventure lifecycle, resumable playback, clean Godot architecture, readable combat presentation, versioned asset pipeline, and an Android-playable vertical slice, while intentionally deferring online/ranked infrastructure.

**Architecture:** `game-core` remains the gameplay authority. Production combat consumes versioned 4×8 rules and immutable Adventure snapshots and produces both authoritative outcome and deterministic playback. `AdventureSession` owns atomic state/save orchestration. Godot consumes public state + commands + playback events only. Legacy 3×8 simulation remains isolated for historical regression until replacement evidence exists.

**Tech Stack:** TypeScript 5.9, Node.js 22+, pnpm 11, Vitest 4, Godot 4.7+, GDScript, JSON versioned rules/content/release manifests, Android export pipeline.

## Global constraints

Read and obey root `CONTEXT.md` before every mission.

- Work from latest `codex/gate-0-canonical-rules`; create a new isolated branch/worktree such as `antigravity/offline-foundation-hardening`.
- Do not implement auth, WebSocket, Redis, matchmaking, ranked, seasons, leaderboard, achievements, or production anti-cheat.
- Do not edit `alpha-0.3.0` historical meaning in place.
- Do not make Godot calculate authoritative gameplay.
- Do not introduce independent production board/economy/shop/progression constants.
- Do not add hero-ID-specific gameplay branches.
- Do not delete legacy combat until parity/golden evidence exists.
- Do not claim a gate complete without fresh command evidence.

---

# Antigravity operating procedure

## First prompt to Antigravity

Paste this once after opening the repository workspace:

```text
Read CONTEXT.md first. Then read:
- docs/superpowers/plans/2026-08-07-antigravity-offline-foundation-handoff.md
- docs/superpowers/plans/2026-08-07-offline-foundation-execution.md
- docs/evidence/offline-foundation-progress.md
- PR #3 history/diff if available locally

Do not code yet.

Audit the current branch against Mission 0 and the load-bearing dependencies for Missions 1-11. Verify actual files and interfaces instead of trusting stale summaries. Produce an implementation plan with exact files, tests, and any conflicts you found. Preserve the locked 4x8 offline-first architecture and all authority boundaries in CONTEXT.md.

After the plan is internally consistent, execute Missions 0-11 sequentially without asking for approval between ordinary steps. Stop only for a genuine blocker, a contradiction with CONTEXT.md, or repeated failing verification that cannot be diagnosed.

For every mission:
1. write/identify failing focused tests;
2. run them and record the expected failure;
3. implement the minimum correct change;
4. run focused tests;
5. run impacted package tests;
6. commit coherently;
7. update docs/evidence/offline-foundation-progress.md with only real evidence;
8. report commit SHA and remaining debt.

Never claim 'done', 'fixed', 'passing', or 'playable' without fresh verification output.
```

---

# Mission 0 — Preflight, branch isolation, and factual baseline

**Purpose:** Establish exactly what currently passes and what is broken before changing implementation.

**Primary files to read:**

- `CONTEXT.md`
- `docs/evidence/offline-foundation-progress.md`
- `docs/superpowers/plans/2026-08-07-offline-foundation-execution.md`
- `rules/production-0.1.0/ruleset.json`
- `releases/offline-foundation-0.1.0/release.json`
- `game-core/src/adventure/*.ts`
- `game-core/src/simulation/kernel.ts`
- `client-godot/scripts/adventure/*.gd`
- `.github/workflows/ci.yml`
- root `package.json`

## Steps

- [ ] Confirm workspace and branch:

```bash
git status --short
git branch --show-current
git log -1 --oneline
```

- [ ] If not already isolated, create a worktree/branch from latest foundation head:

```bash
git fetch origin
git worktree add ../MINICHESS-antigravity -b antigravity/offline-foundation-hardening origin/codex/gate-0-canonical-rules
cd ../MINICHESS-antigravity
```

- [ ] Install exact dependencies:

```bash
corepack enable
pnpm install --frozen-lockfile
```

- [ ] Run full root verification once before changes:

```bash
pnpm run check
```

- [ ] Run Godot headless tests if Godot is available:

```bash
for test in client-godot/test/*_test.gd; do
  godot --headless --path client-godot --script "res://test/$(basename "$test")" --quit || exit 1
done
```

- [ ] Record every failure in `docs/evidence/offline-foundation-progress.md` under a dated `Antigravity preflight` section. Do not fix failures in this step.
- [ ] Inspect current public exports and current types for playback/engine/session. Confirm whether the code at HEAD matches this plan before changing it.

**Gate:** A factual baseline exists. No unknown failing test is silently ignored.

**Commit:** documentation-only only if evidence file changed.

```bash
git add docs/evidence/offline-foundation-progress.md
git commit -m "docs: record Antigravity foundation preflight"
```

---

# Mission 1 — Finish the combat playback contract end-to-end

**Purpose:** The playback contract already exists but must be carried through engine → lifecycle/session → Godot runtime without losing type safety or deterministic validation.

**Existing core files:**

- `game-core/src/adventure/playback.ts`
- `game-core/src/adventure/engine.ts`
- `game-core/src/adventure/lifecycle.ts`
- `game-core/src/adventure/session.ts`
- `game-core/src/adventure/state.ts`
- `game-core/src/adventure/protocol.ts`
- `game-core/src/index.ts`
- `client-godot/scripts/adventure/adventure_runtime_port.gd`
- corresponding tests under `game-core/test/adventure/` and `client-godot/test/`

## Required final interfaces

Create/retain these concepts with exact single ownership:

```ts
interface AdventureCombatEngineResult {
  readonly outcome: AdventureCombatOutcome;
  readonly playback: AdventureCombatPlayback;
}

interface AdventureCombatResolutionResult extends AdventureMutationResult {
  readonly playback: AdventureCombatPlayback;
}
```

If equivalent types already exist under different names, normalize to one naming scheme instead of duplicating them.

## Steps

- [ ] Add a failing engine test proving the engine result must include playback whose `combatId` and `snapshotHash` match the exact snapshot.
- [ ] Add a failing test proving a playback with a modified `eventLogHash`, timing, sequence, or snapshot hash is rejected before mutation is committed.
- [ ] Add a failing test proving `COMBAT_ENDED.payload.winner` and final event tick agree with authoritative outcome.
- [ ] Update `AdventureCombatEngine.resolve()` to return outcome + playback, not outcome-only.
- [ ] In `resolveAdventureCombat()`, validate playback with `assertAdventureCombatPlayback()` before accepting the outcome.
- [ ] Preserve the existing retry guarantee: a repeated `RESOLVE_COMBAT` command must return the receipt/result without calling the engine again.
- [ ] Ensure `AdventureSession.resolveCombat()` returns the typed resolution result carrying playback.
- [ ] Export all required playback/result types through `game-core/src/index.ts`.
- [ ] Update every fake/stub combat engine in tests to return a valid minimal playback.
- [ ] Update root/domain smoke runner so its fake combat engine also returns validated playback.
- [ ] Add Godot runtime response support for playback. The runtime port should emit a distinct signal/event such as:

```gdscript
signal combat_playback_ready(playback: Dictionary)
```

Do not make Godot invent missing timing fields.

## Focused verification

```bash
pnpm --filter @auto-battler/game-core test -- \
  test/adventure/playback.test.ts \
  test/adventure/engine.test.ts \
  test/adventure/session.test.ts \
  test/adventure/lifecycle.test.ts
```

Run Godot runtime tests:

```bash
godot --headless --path client-godot --script res://test/adventure_runtime_port_test.gd --quit
```

Then:

```bash
pnpm run check
```

**Gate:** No production combat resolution can succeed without a validated deterministic playback log tied to the exact snapshot.

**Commit:**

```bash
git add game-core client-godot tools package.json docs/evidence/offline-foundation-progress.md
git commit -m "feat: carry authoritative combat playback through Adventure runtime"
```

---

# Mission 2 — Introduce explicit production 4×8 simulation geometry

**Purpose:** Remove the production dependency on the legacy kernel's 3×8 assumptions without breaking historical Alpha regression coverage.

**Do not immediately rewrite the entire legacy file.** First make geometry an explicit dependency.

**Files:**

- Create: `game-core/src/simulation/geometry.ts`
- Create: `game-core/src/simulation/production-kernel.ts` or an equivalently focused module
- Modify only where needed: `game-core/src/simulation/kernel.ts`
- Modify: `game-core/src/adventure/engine.ts`
- Modify: `game-core/src/adventure/snapshot.ts`
- Tests: new `game-core/test/simulation/production-geometry.test.ts`
- Tests: production combat tests under `game-core/test/adventure/`

## Required geometry contract

```ts
interface CombatGeometry {
  readonly columns: number;
  readonly rows: number;
  readonly cellCount: number;
}
```

Provide helpers for:

- row/column conversion;
- Manhattan distance;
- orthogonal neighbors;
- legal cell validation;
- horizontal/vertical displacement direction;
- row-crossing prevention.

Production geometry must come from `AdventureCombatSnapshot.board` / compiled rules. No default to 3 columns is permitted in production paths.

## Steps

- [ ] Write failing 4×8 tests for:
  - corner neighbors: `0 -> [1,4]`;
  - interior neighbors: `5 -> [1,4,6,9]`;
  - last cell: `31 -> [27,30]`;
  - Manhattan distance `0 -> 31 == 10`;
  - player local 0 globally equals 16 through snapshot mapping.
- [ ] Write failing pathfinding test where a route that is correct on four columns would be wrong under `%3` / `/3` math.
- [ ] Write failing knockback tests across horizontal and vertical edges.
- [ ] Write failing dash/retreat/summon-placement tests on 4×8.
- [ ] Implement geometry module.
- [ ] Add a clearly named legacy geometry adapter for historical 3×8 tests, for example `LEGACY_ALPHA_GEOMETRY`.
- [ ] Refactor reusable simulation helpers to accept explicit geometry.
- [ ] Ensure the new production kernel has no `BOARD_CELL_COUNT = 24`, `/ 3`, `% 3`, `± 3`, or column-3 magic.
- [ ] Do not alter legacy golden hashes unless the test explicitly exercises the new production engine.

## Verification searches

```bash
rg -n 'BOARD_CELL_COUNT\s*=\s*24|/\s*3|%\s*3|\+\s*3|-\s*3' game-core/src
```

Every remaining match must either be:

- inside a clearly named legacy compatibility module; or
- unrelated arithmetic with an explanatory reason.

Run:

```bash
pnpm --filter @auto-battler/game-core test -- \
  test/rules/board.test.ts \
  test/simulation/production-geometry.test.ts
```

**Gate:** Production geometry is explicit and 4×8. Legacy 3×8 exists only behind named compatibility boundaries.

**Commit:**

```bash
git commit -am "refactor: make production combat geometry rules-driven"
```

---

# Mission 3 — Production deterministic combat parity

**Purpose:** Bring the production 4×8 kernel to feature parity for all launch combat primitives already used by content.

**Required combat behaviors:**

- target selection;
- movement/pathing;
- basic attack;
- crit;
- mana gain;
- cast start/resolution;
- damage types and mitigation;
- heal;
- shield;
- stun;
- slow;
- timed stat modifiers;
- DoT;
- cleanse;
- dash;
- retreat;
- knockback;
- summon and summon expiry;
- passive triggers already represented in content;
- deterministic timeout winner;
- result hash;
- deterministic presentation event log.

## Steps

- [ ] Inventory every `EffectPrimitive` and `CombatTriggerKind` reachable from `alpha-0.3.0` content.
- [ ] Add a test that fails when a compiled reachable primitive/trigger lacks a production executor.
- [ ] Port one primitive family at a time into the production kernel, preserving integer/fixed-point math.
- [ ] Convert combat actions into playback events with explicit start/release/impact/death semantics.
- [ ] Basic attack example ordering:

```text
ATTACK_STARTED
PROJECTILE_RELEASED (ranged only)
DAMAGE_APPLIED at impactTick
UNIT_DIED only after lethal DAMAGE_APPLIED
```

- [ ] Skill example ordering:

```text
CAST_STARTED
CAST_RELEASED
EFFECT / DAMAGE / HEAL / SHIELD at impact
UNIT_DIED after lethal impact
```

- [ ] HP values in playback payload must reflect authoritative post-impact state.
- [ ] Event sequence must be stable and contiguous.
- [ ] Hash identical input snapshot + seed twice and assert identical outcome and playback hashes.
- [ ] Run at least 1,000 deterministic repeats/order variations in a focused stress test.

## Verification

```bash
pnpm --filter @auto-battler/game-core test -- test/simulation test/adventure/playback.test.ts test/adventure/engine.test.ts
pnpm run check
```

**Gate:** All launch content combat effects execute on production 4×8 without calling the legacy 3×8 kernel.

**Commit:**

```bash
git commit -am "feat: complete deterministic 4x8 production combat"
```

---

# Mission 4 — Make combat playback a resumable Adventure phase

**Purpose:** A crash/restart during playback must not rerun combat, skip the fight, or duplicate reward.

The current lifecycle may transition directly from COMBAT to REWARD. Refine the phase model so resolved playback can be persisted and acknowledged explicitly.

## Target phase model

```text
PREPARE
→ COMBAT
→ PLAYBACK
→ REWARD
→ PREPARE / COMPLETE
```

## Files

- `game-core/src/adventure/types.ts`
- `game-core/src/adventure/state.ts`
- `game-core/src/adventure/lifecycle.ts`
- `game-core/src/adventure/reducer.ts`
- `game-core/src/adventure/save.ts`
- `game-core/src/adventure/session.ts`
- `game-core/src/adventure/view.ts`
- `game-core/src/adventure/protocol.ts`
- tests for lifecycle/save/session/view/protocol

## Steps

- [ ] Add `PLAYBACK` to Adventure phase type.
- [ ] Persist the validated resolved playback (or an immutable replay record sufficient to reconstruct it) as state linked to `lastCombat`.
- [ ] `RESOLVE_COMBAT` moves COMBAT → PLAYBACK, not REWARD.
- [ ] Add idempotent command:

```ts
{ type: "ACK_PLAYBACK_COMPLETE", commandId, expectedRevision }
```

- [ ] ACK moves PLAYBACK → REWARD and exposes the already-derived pending reward.
- [ ] Repeated ACK is idempotent.
- [ ] Save during PLAYBACK; restore; assert engine call count remains unchanged and playback hash is identical.
- [ ] Public view exposes only presentation-safe playback metadata/events, never seed/private pool/history.
- [ ] Reward cannot be claimed before ACK.
- [ ] Defeat-to-zero still produces final playback first; COMPLETE occurs only after playback acknowledgment/result flow is stable.

## Verification

```bash
pnpm --filter @auto-battler/game-core test -- \
  test/adventure/lifecycle.test.ts \
  test/adventure/save.test.ts \
  test/adventure/session.test.ts \
  test/adventure/view.test.ts \
  test/adventure/protocol.test.ts
```

**Gate:** Restore during playback resumes the same authoritative combat presentation without rerunning simulation or duplicating mutations.

**Commit:**

```bash
git commit -am "feat: make Adventure combat playback resumable"
```

---

# Mission 5 — Complete an eight-round headless Adventure using the production engine

**Purpose:** Prove the game domain itself works before rebuilding UI.

**Files:**

- `tools/run-adventure-domain-smoke.mjs`
- optional dedicated test: `game-core/test/adventure/full-run.test.ts`
- production engine/session/lifecycle modules

## Steps

- [ ] Replace fake outcome-only combat in the domain smoke with the production 4×8 combat engine.
- [ ] Build deterministic scripted player decisions sufficient to progress all eight rounds.
- [ ] Exercise:
  - buying;
  - refresh;
  - XP;
  - board movement;
  - merge;
  - item reward;
  - hero reward queue;
  - Unique 1-of-3 selection;
  - equip;
  - combat playback ACK;
  - reward claim;
  - save/restore at least once;
  - final boss/result.
- [ ] Add a deterministic defeat-path test as well.
- [ ] Run the same scripted seed twice and assert identical final state hash/result/replays.

## Verification

```bash
pnpm run adventure:domain-smoke
pnpm run check
```

**Gate:** Pure TypeScript domain can complete both win and defeat Adventure paths using real production combat.

**Commit:**

```bash
git commit -am "test: prove complete production Adventure lifecycle"
```

---

# Mission 6 — Build the Godot Adventure runtime boundary

**Purpose:** Godot must operate through public state + commands + playback, not through old server/run assumptions.

**Existing files:**

- `client-godot/scripts/adventure/adventure_runtime_port.gd`
- `adventure_command_factory.gd`
- `adventure_controller.gd`
- `adventure_view_model.gd`
- current tests in `client-godot/test/`

## Required Godot-facing concepts

- runtime session start/restore/reset;
- public view update;
- command dispatch;
- phase change;
- playback ready;
- command rejection reason;
- save/restore result.

## Steps

- [ ] Define one runtime response schema in TypeScript protocol and mirror it in Godot tests.
- [ ] Remove any Godot-side rule computations that duplicate TypeScript availability or phase logic.
- [ ] Godot command factory creates intent payloads only.
- [ ] View model uses server/domain-provided action availability and disabled reasons.
- [ ] Runtime emits playback separately from state view.
- [ ] Add PLAYBACK phase to controller/view model.
- [ ] Save/restore must load the versioned domain view and, if in PLAYBACK, re-emit the stored playback.
- [ ] No localhost/server is required for offline Adventure.

## Verification

```bash
for test in client-godot/test/adventure_*_test.gd; do
  godot --headless --path client-godot --script "res://test/$(basename "$test")" --quit || exit 1
done
```

**Gate:** Godot can drive a mocked/embedded Adventure session solely via domain contracts with no duplicated gameplay rules.

**Commit:**

```bash
git commit -am "refactor: make Godot Adventure consume domain runtime contracts"
```

---

# Mission 7 — Replace the Godot God-object with real scenes/presenters

**Purpose:** Establish maintainable client architecture before visual polish.

## Target structure

```text
client-godot/
  scenes/
    app/app_root.tscn
    screens/home_screen.tscn
    match/prepare_screen.tscn
    match/combat_screen.tscn
    match/reward_screen.tscn
    match/result_screen.tscn
    screens/collection_screen.tscn
    screens/settings_screen.tscn
    components/
  scripts/
    app/app_controller.gd
    presenters/adventure_presenter.gd
    presenters/prepare_presenter.gd
    presenters/combat_presenter.gd
    presenters/reward_presenter.gd
    assets/asset_resolver.gd
```

## Steps

- [ ] Add scene smoke tests before migration.
- [ ] Create `AppController` only for navigation/application lifecycle.
- [ ] Create one presenter per player-facing phase.
- [ ] Move UI construction out of `battle_controller.gd` into `.tscn` resources and reusable components.
- [ ] Prepare screen must always expose board, bench, shop and primary action without scrolling.
- [ ] Shop/items/traits may use controlled tabs/bottom sheet.
- [ ] Formation supports drag-drop and tap-select through the same command intent.
- [ ] Disabled actions show an explicit domain reason.
- [ ] Keep old controller as compatibility adapter only until parity tests pass.
- [ ] Delete/retire old controller responsibilities only after all new scene tests are green.

## Verification

Run complete Godot suite plus screenshot/manual inspection at target portrait sizes.

**Gate:** Player can navigate Home → Prepare → Combat/Playback → Reward → Result with no developer control path.

**Commit:**

```bash
git commit -am "refactor: rebuild Adventure client around Godot scenes and presenters"
```

---

# Mission 8 — Implement deterministic combat presentation in Godot

**Purpose:** Make combat readable and temporally correct before remaking art.

## Components to create

- `CombatTimeline`
- `CombatActor`
- `ProjectilePool`
- `VfxPool`
- `FloatingNumberPool`
- `StatusPresenter`
- `CombatCameraDirector`

## Actor state priority

```text
Death
> HardControl
> Hit
> Cast
> Attack
> Move
> Idle
```

## Steps

- [ ] Write playback fixture tests for attack, ranged projectile, cast, stun, heal, shield, knockback, summon, death.
- [ ] Timeline maps authoritative ticks to presentation time using playback tick rate.
- [ ] HP only updates at `DAMAGE_APPLIED`/`HEAL_APPLIED` impact.
- [ ] Ranged projectile release and impact align with `releaseTick` and `impactTick`.
- [ ] Death cannot be overwritten by idle/move.
- [ ] Status icons show apply/remove from events.
- [ ] Basic attack VFX stays lower visual priority than skill cast.
- [ ] Pool temporary nodes to avoid combat allocation spikes.
- [ ] Add 1×/2× playback without changing event order.
- [ ] Reduced Motion changes interpolation/animation, not authoritative timing order.

**Gate:** Given a recorded playback, Godot produces the same semantic sequence every replay and never displays state before its authoritative event.

**Commit:**

```bash
git commit -am "feat: add authoritative combat playback presentation"
```

---

# Mission 9 — Harden production content and generic gameplay primitives

**Purpose:** Make all H01–H20, traits, items and U01–U06 production-reachable without hero-specific code.

## Steps

- [ ] Create a new production-compatible content version; do not rewrite historical `alpha-0.3.0` meaning.
- [ ] Validate cardinality:
  - 20 heroes;
  - 20 skills;
  - 10 traits;
  - 12 normal items;
  - 6 Unique items;
  - 6 transformations;
  - 8 encounters.
- [ ] Validate every runtime visual profile has separate board visual, portrait, ability icon and transformation/VFX references.
- [ ] Search gameplay code for hero-ID branching:

```bash
rg -n 'H0[1-9]|H1[0-9]|H20' game-core/src server/src
```

Every gameplay hit must be content/data/reference logic, never custom hero behavior branching.
- [ ] Ensure every compiled effect primitive and trigger has executor coverage.
- [ ] Add deterministic balance simulation script with explicit seeds and sample size.
- [ ] Produce a report containing pick/use frequency, win/loss proxies, damage/heal/shield distributions and caveats. Do not overfit balance from tiny samples.

**Gate:** All launch gameplay content executes through generic primitives and is compatible with production rules.

**Commit:**

```bash
git commit -am "feat: harden launch content for production Adventure"
```

---

# Mission 10 — Remake asset contract and animation pipeline

**Purpose:** Stop using one generated image for multiple runtime roles and establish a repeatable art pipeline.

Do not attempt to generate all final art before the manifest/schema is stable.

## Required per-hero asset roles

```text
hero/Hxx/
  board/
  portrait/
  ability_icon/
  rig/
  animation/
  transformation/
  vfx/
```

## Steps

- [ ] Define versioned asset manifest schema keyed by hero/content IDs.
- [ ] Add validator that fails on missing production-required roles.
- [ ] Keep safe placeholder/fallback art explicit and visibly marked in development; do not silently promote placeholders to final.
- [ ] Build two fully production-ready reference heroes first: one melee/frontline, one ranged/caster.
- [ ] Verify scale, baseline, camera angle, outline, lighting and pivot conventions.
- [ ] Create species/shared rig conventions where genuinely reusable; allow per-hero overrides.
- [ ] Every hero supports at minimum Idle, Move, Attack, Cast, Hit, HardControl, Death, Victory.
- [ ] Add transformation overlay/attachment support for U01–U06.
- [ ] Only after the two reference heroes pass mobile readability, expand to all H01–H20.
- [ ] Add four biome board/monster sets and audio after hero presentation contract is stable.

**Gate:** Assets are role-specific, versioned, validated and interchangeable without gameplay changes.

**Commit:** one coherent commit series by asset subsystem; do not mix binary art churn with unrelated gameplay refactors.

---

# Mission 11 — Full offline Android vertical slice and final audit

**Purpose:** Produce real evidence that the foundation is a game, not just a library.

## Required flow

```text
Fresh Install
→ Home
→ Adventure
→ Prepare
→ Combat Playback
→ Reward
→ Upgrade/Build
→ ...
→ Final Boss
→ Result
→ Replay
→ Home / New Run
```

## Automated verification

```bash
pnpm run check
```

Godot:

```bash
for test in client-godot/test/*_test.gd; do
  godot --headless --path client-godot --script "res://test/$(basename "$test")" --quit || exit 1
done
```

## Android evidence

- [ ] Export signed test artifact using the project Android preset.
- [ ] Install on Android emulator.
- [ ] Run complete Adventure win path.
- [ ] Run defeat path.
- [ ] Force-close during PREPARE and restore.
- [ ] Force-close during PLAYBACK and restore without rerunning combat.
- [ ] Force-close during REWARD and restore without duplicating reward.
- [ ] Test at least one physical Android device if available.
- [ ] Capture:
  - FPS/frame time;
  - memory;
  - texture memory where available;
  - touch accuracy;
  - common tall-phone aspect ratio;
  - text scaling;
  - crash/ANR observations.

## Final code audit searches

```bash
rg -n 'BOARD_CELL_COUNT\s*=\s*24|/\s*3|%\s*3' game-core/src
rg -n '127\.0\.0\.1:3000' client-godot
rg -n 'H0[1-9]|H1[0-9]|H20' game-core/src
rg -n 'TODO|FIXME|HACK' game-core/src client-godot/scripts
```

Review every hit and classify it in the evidence/debt ledger.

## Final documentation

Update:

- `docs/evidence/offline-foundation-progress.md`
- create `docs/evidence/offline-vertical-slice-release-gate.md`

The release-gate document must contain:

- exact commit SHA;
- exact commands;
- test counts/results;
- Godot result;
- Android artifact identity;
- device/emulator evidence;
- known non-blocking debt;
- explicit list of deferred online systems.

**Final gate:** A complete 15–25 minute offline Adventure can be played on Android from fresh install through result/replay with no critical gameplay, save, input or presentation defect, and without requiring a user-visible server setup.

---

# Required mission report format

At the end of every mission, Antigravity must output:

```text
MISSION <N> — <name>
STATUS: PASS | BLOCKED | FAIL

Changed:
- <file paths>

Verification:
- <exact command> -> <pass/fail summary>

Commits:
- <sha> <message>

Remaining debt:
- <specific items only>

Next unblocked mission:
- Mission <N+1> ...
```

A mission marked `BLOCKED` must include the exact blocker and the smallest evidence needed to unblock it.

---

# Final instruction to Antigravity

Do not optimize for number of files changed or visible feature count. Optimize for a codebase where gameplay truth is deterministic, versioned, testable, resumable and independent of UI/networking. The immediate success criterion is a strong offline game foundation; online systems are intentionally postponed.
