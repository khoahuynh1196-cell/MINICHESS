# Mobile Game UI Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the existing Godot Auto Battler replay and run controls visible and usable in the portrait mobile viewport.

**Architecture:** Keep `battle_controller.gd` as the presentation controller. Replace its out-of-bounds fixed control origin with a visible header, board-safe content region, and a scrollable action panel. The scene continues to consume replay/API events exactly as before.

**Tech Stack:** Godot 4.7, GDScript, existing headless SceneTree tests.

## Global Constraints

- Preserve the authoritative-combat boundary: Godot presents events and never resolves combat rules.
- Keep the existing 1080 x 1920 viewport and portrait override.
- Do not add server endpoints, new gameplay rules, or a client combat simulator.
- Keep controls within the visible viewport and test the invariant.

---

### Task 1: Visible mobile layout

**Files:**
- Modify: `client-godot/scripts/battle_controller.gd:1-560`
- Modify: `client-godot/test/main_scene_smoke_test.gd:1-170`

**Interfaces:**
- Consumes: `BattleController._create_controls() -> void` and the current `Label`, `Button`, `HBoxContainer`, and `VBoxContainer` fields.
- Produces: `BattleController.mobile_controls_rect() -> Rect2`, used by the scene smoke test to assert the visible panel bounds.

- [x] **Step 1: Write the failing test**

Add the assertion after `main_scene` instantiation in `main_scene_smoke_test.gd`:

```gdscript
var controls_rect: Rect2 = main_scene.mobile_controls_rect()
if not _expect(controls_rect.position.y >= 0.0 and controls_rect.end.y <= 1920.0, "mobile controls must remain inside the portrait viewport"):
	main_scene.free()
	_finish()
	return
```

- [x] **Step 2: Run test to verify it fails**

Run: `& '<godot-console>' --headless --path 'D:\CODE\client-godot' --script 'res://test/main_scene_smoke_test.gd'`

Expected: FAIL because `mobile_controls_rect` does not exist.

- [x] **Step 3: Write minimal implementation**

In `battle_controller.gd`, create a visible `CanvasLayer` with a top header and replace the fixed `VBoxContainer` at `Vector2(16.0, 1060.0)` with a `ScrollContainer` positioned inside the lower visible viewport. Return its fixed panel bounds from:

```gdscript
func mobile_controls_rect() -> Rect2:
	return Rect2(24.0, 1180.0, 1032.0, 700.0)
```

Lay out controls at `Vector2(24.0, 1180.0)` inside the scroll panel and size it to `Vector2(1032.0, 700.0)`; add header labels at `Vector2(24.0, 24.0)` and `Vector2(24.0, 74.0)` so status and run state are visible.

- [x] **Step 4: Run test to verify it passes**

Run the same headless scene smoke test. Expected: `PASS main_scene_smoke_test`.

- [x] **Step 5: Run all Godot regression tests**

Run every existing script under `client-godot/test/` with the Godot console binary. Expected: all seven test scripts exit with code 0.

- [x] **Step 6: Commit**

Run: `git add client-godot/scripts/battle_controller.gd client-godot/test/main_scene_smoke_test.gd`

Run: `git commit -m "fix: render mobile game controls inside viewport"`

### Task 2: Capture real in-game UI states

**Files:**
- Create: `tmp/screenshots/mobile-replay.png`
- Create: `tmp/screenshots/mobile-run-panel.png`
- Create: `tmp/screenshots/mobile-board.png`

**Interfaces:**
- Consumes: the running Godot main scene from Task 1.
- Produces: three local PNG captures for review; `tmp/` remains excluded from Git.

- [ ] **Step 1: Launch the game at the portrait override**

Run the Godot executable with `--path D:\CODE\client-godot`, wait until the title is `Auto Battler 2D Alpha (DEBUG)`, and verify the header, board, and action panel are all visible.

- [ ] **Step 2: Capture replay state**

Capture the initial local replay with visible status and board to `tmp/screenshots/mobile-replay.png`.

- [ ] **Step 3: Capture action-panel state**

Capture the same running build with the scrollable controls visible to `tmp/screenshots/mobile-run-panel.png`.

- [ ] **Step 4: Capture board state**

Capture a replay moment with units on the board to `tmp/screenshots/mobile-board.png`.

- [ ] **Step 5: Verify captures**

Open all three PNGs and confirm that each has readable UI, a visible board, and no controls outside the mobile viewport.
