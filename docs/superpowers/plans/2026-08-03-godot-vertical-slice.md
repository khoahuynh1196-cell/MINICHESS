# Godot Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a local Godot 4 battle viewer that plays a deterministic, server-shaped combat event log without duplicating combat rules.

**Architecture:** `game-core` remains the only combat authority. A fixture JSON mirrors the versioned event-log contract; Godot parses it into presentation state and advances visuals by event tick. The scene is a 3×8 board with placeholder units, HP bars, combat status and replay controls.

**Tech Stack:** Godot 4.x, GDScript, JSON fixtures, TypeScript/Vitest for fixture-contract checks.

## Global Constraints

- Create the client only under `/client-godot`; no simulation TypeScript is copied into GDScript.
- The client renders immutable event data and must not calculate combat damage, rewards, RNG, targeting or outcome.
- Board shape is 3 columns × 8 rows; presentation uses grid index `row * 3 + column`.
- Event playback is deterministic by `(tick, sequence)` and accepts unknown payload fields.
- Use local generated placeholder visuals only; no protected or external game assets.
- Keep existing uncommitted work intact; do not commit unless the user explicitly asks.

---

### Task 1: Add the Godot project shell and contract fixture

**Files:**
- Create: `client-godot/project.godot`
- Create: `client-godot/scenes/main.tscn`
- Create: `client-godot/scripts/combat_event.gd`
- Create: `client-godot/fixtures/combat-replay.json`
- Create: `game-core/test/client-fixture.test.ts`

**Interfaces:**
- Consumes: `CombatEvent` shape from `game-core/src/simulation/kernel.ts`.
- Produces: a parseable Godot project and an immutable fixture with ascending `sequence`, event `tick`, `type`, optional source/target IDs and payload.

- [x] **Step 1: Write the failing fixture-contract test**

```ts
it("keeps the Godot replay fixture ordered and compatible with combat events", () => {
  const events = loadReplayFixture();
  expect(events.map((event) => event.sequence)).toEqual([0, 1, 2, 3]);
  expect(events[0]).toMatchObject({ tick: 0, type: "COMBAT_STARTED" });
  expect(events.at(-1)).toMatchObject({ type: "COMBAT_ENDED" });
});
```

- [x] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/client-fixture.test.ts`

Expected: FAIL because `client-godot/fixtures/combat-replay.json` does not exist.

- [x] **Step 3: Add the minimal project files and fixture**

```json
{
  "events": [
    { "sequence": 0, "tick": 0, "type": "COMBAT_STARTED", "payload": {} },
    { "sequence": 1, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "enemy:E01:1", "payload": { "side": "enemy", "position": 1 } },
    { "sequence": 2, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "player:H01:1", "payload": { "side": "player", "position": 22 } },
    { "sequence": 3, "tick": 1, "type": "COMBAT_ENDED", "payload": { "winner": "enemy", "reason": "timeout" } }
  ]
}
```

`project.godot` sets `run/main_scene="res://scenes/main.tscn"`; the empty scene instantiates the battle controller in Task 3.

- [x] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @auto-battler/game-core exec vitest run test/client-fixture.test.ts`

Expected: PASS.

### Task 2: Implement replay parsing and deterministic event scheduling

**Files:**
- Create: `client-godot/scripts/replay_loader.gd`
- Create: `client-godot/scripts/replay_scheduler.gd`
- Modify: `client-godot/scripts/combat_event.gd`

**Interfaces:**
- Consumes: `res://fixtures/combat-replay.json`.
- Produces: `ReplayLoader.load_events(path: String) -> Array[CombatEvent]` and `ReplayScheduler.advance(delta_seconds: float) -> Array[CombatEvent]`.

- [x] **Step 1: Write the GDScript test scene**

```gdscript
func test_scheduler_releases_same_tick_events_by_sequence() -> void:
  var scheduler := ReplayScheduler.new([event(2, 1), event(2, 0)])
  scheduler.advance(0.10)
  assert_eq(scheduler.advance(0.01).map(func(e): return e.sequence), [0, 1])
```

- [x] **Step 2: Run it to verify it fails**

Run: `godot --headless --path client-godot --script res://test/replay_scheduler_test.gd`

Expected: FAIL because the loader and scheduler do not exist.

- [x] **Step 3: Implement minimal parsing and scheduling**

```gdscript
func advance(delta_seconds: float) -> Array[CombatEvent]:
    elapsed_ticks += int(floor(delta_seconds * TICKS_PER_SECOND))
    return _drain_due_events()
```

Sort parsed events once by `(tick, sequence)` and drain all events whose tick is due. Reject malformed JSON, missing event type, non-integer tick or decreasing sequence with an in-app error state.

- [x] **Step 4: Run the headless Godot test to verify it passes**

Run: `godot --headless --path client-godot --script res://test/replay_scheduler_test.gd`

Expected: PASS.

### Task 3: Render the board and apply presentation-only events

**Files:**
- Create: `client-godot/scripts/battle_controller.gd`
- Create: `client-godot/scripts/unit_view.gd`
- Modify: `client-godot/scenes/main.tscn`
- Modify: `client-godot/fixtures/combat-replay.json`

**Interfaces:**
- Consumes: due `CombatEvent` values from `ReplayScheduler`.
- Produces: `BattleController.apply_event(event: CombatEvent) -> void`, mapping spawn/move/damage/death/end events to Nodes only.

- [x] **Step 1: Write the event-application test scene**

```gdscript
func test_spawn_and_damage_update_only_the_view_state() -> void:
  controller.apply_event(spawn_event("player:H01:1", 22))
  controller.apply_event(damage_event("player:H01:1", 25_000, 75_000))
  assert_eq(controller.unit_views["player:H01:1"].grid_index, 22)
  assert_eq(controller.unit_views["player:H01:1"].hp, 75_000)
```

- [x] **Step 2: Run it to verify it fails**

Run: `godot --headless --path client-godot --script res://test/battle_controller_test.gd`

Expected: FAIL because `BattleController` cannot apply events.

- [x] **Step 3: Implement the scene and controller**

Create a dark background, 24 grid cells, colored `Polygon2D` unit placeholders, compact HP bars and a status label. Apply only `UNIT_SPAWNED`, `UNIT_MOVED`, `UNIT_DISPLACED`, `DAMAGE_APPLIED`, `HEAL_APPLIED`, `UNIT_DIED` and `COMBAT_ENDED`; ignored future event types are logged once and do not stop playback.

- [x] **Step 4: Run the event-application test to verify it passes**

Run: `godot --headless --path client-godot --script res://test/battle_controller_test.gd`

Expected: PASS.

### Task 4: Add local replay controls and smoke verification

**Files:**
- Modify: `client-godot/scenes/main.tscn`
- Modify: `client-godot/scripts/battle_controller.gd`
- Create: `client-godot/test/main_scene_smoke_test.gd`
- Modify: `README.md`

**Interfaces:**
- Consumes: `BattleController`, `ReplayScheduler`, fixture event log.
- Produces: play/pause, restart and 1×/2× controls that alter playback presentation only.

- [x] **Step 1: Write the smoke test**

```gdscript
func test_main_scene_loads_and_replays_to_terminal_status() -> void:
  var scene := load("res://scenes/main.tscn").instantiate()
  add_child(scene)
  scene.replay_all_for_test()
  assert_true(scene.status_label.text.contains("Combat ended"))
```

- [x] **Step 2: Run it to verify it fails**

Run: `godot --headless --path client-godot --script res://test/main_scene_smoke_test.gd`

Expected: FAIL because replay controls and terminal status are absent.

- [x] **Step 3: Implement the minimal controls and documentation**

Use Buttons labelled `Play`, `Pause`, `Restart`, `1×` and `2×`. Restart reloads the immutable fixture and destroys only unit-view Nodes. Add `README.md` commands for headless tests and launching the scene.

- [x] **Step 4: Verify the full slice**

Run: `pnpm run check`

Run: `godot --headless --path client-godot --script res://test/replay_scheduler_test.gd`

Run: `godot --headless --path client-godot --script res://test/battle_controller_test.gd`

Run: `godot --headless --path client-godot --script res://test/main_scene_smoke_test.gd`

Expected: all commands pass; manually launch `godot --path client-godot --editor` and verify a 3×8 board, two units, HP change and terminal status.
