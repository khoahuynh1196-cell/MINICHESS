# Mobile Game UI Layout Design

## Goal

Render the existing Auto Battler replay and run controls in a usable 1080 x 1920 portrait viewport, then capture real in-game states.

## Layout

- A compact top header shows combat status, round, health, and gold.
- The board occupies the center of the portrait viewport and continues to render the authoritative replay units.
- A scrollable bottom panel contains Shop, Bench, Items, run controls, and replay controls.
- All controls remain inside the 1080 x 1920 viewport. No control is positioned below the visible viewport.

## Interaction and states

- The initial local replay remains playable without a connected server.
- Controls that require a connected run remain disabled and communicate their unavailable state.
- Screenshots will cover the local replay, the control panel, and a populated local demo/run-view state if available without changing server authority.

## Constraints

- Preserve the existing authoritative-combat boundary: Godot presents events and never resolves combat rules.
- Reuse the current Godot scene and controller; do not introduce new server endpoints or gameplay rules.
- Add an automated regression test covering the mobile control layout's visible bounds.

## Verification

- The new regression test fails against the previous out-of-bounds layout and passes after the change.
- Existing Godot headless tests pass.
- A launched desktop build visibly shows the complete mobile layout at the configured portrait override size.
