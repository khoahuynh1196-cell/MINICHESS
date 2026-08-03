# Auto-Battler 2D Mobile Alpha

## Workspace checks

```powershell
pnpm install
pnpm run check
```

## Alpha content gate

The approved Alpha content bundle is validated, cross-referenced and canonically
hashed by `game-core`:

```powershell
pnpm --filter @auto-battler/game-core exec vitest run test/content
```

## Godot vertical slice

The Godot 4 client is a presentation-only replay viewer. It reads
`client-godot/fixtures/combat-replay.json`; it does not calculate combat,
RNG, rewards or authority decisions.

Open the scene in Godot 4:

```powershell
godot --editor --path client-godot
```

Run the local headless checks:

```powershell
godot --headless --path client-godot --script res://test/replay_loader_test.gd
godot --headless --path client-godot --script res://test/replay_scheduler_test.gd
godot --headless --path client-godot --script res://test/battle_controller_test.gd
godot --headless --path client-godot --script res://test/main_scene_smoke_test.gd
```

The main scene provides Play, Pause, Restart, 1× and 2× controls. Event
playback is ordered by `(tick, sequence)` at 20 ticks per second.
