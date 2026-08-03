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

Run all local headless checks (the `--quit` flag is required on Godot 4.7):

```powershell
Get-ChildItem client-godot/test/*_test.gd | ForEach-Object {
  godot --headless --path client-godot --script "res://test/$($_.Name)" --quit
}
```

The main scene provides Play, Pause, Restart, 1× and 2× controls. Event
playback is ordered by `(tick, sequence)` at 20 ticks per second.
