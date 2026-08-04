# Auto-Battler 2D Mobile Alpha

The current PvE demo is an eight-round, server-authoritative auto-battler:
20 purchasable heroes (H01–H20), deterministic shop/pool/economy, formation,
items, traits, replay combat, rewards, existing Unique items, recap, collection,
English/Vietnamese UI, and Android debug export.

## Run and verify

```powershell
pnpm install
pnpm --filter @auto-battler/game-core test
pnpm --filter @auto-battler/server test

$godot = 'C:\path\to\Godot_v4.7.1-stable_win64_console.exe'
Get-ChildItem client-godot/test/*_test.gd | ForEach-Object {
  & $godot --headless --path client-godot --script "res://test/$($_.Name)"
}
```

Open `client-godot` with Godot 4.7. The client is presentation-only: it emits
commands and renders authoritative run snapshots/combat events; it never
calculates combat, RNG, rewards, pool mutations, or outcomes.

Controls include formation drag/tap fallback, shop buy/refresh/lock, XP, sell,
item select/drag equip, pause/1x/2x combat replay, reward selection, and screen
navigation. Settings persist sound, music, haptics, Vietnamese, reduced motion,
and text scale.

## Android debug build

```powershell
& $godot --headless --path client-godot --export-debug 'Android Debug' `
  'D:\CODE\tmp\auto-battler-debug.apk'
```

The current debug APK is ARM64, portrait locked, uses the mobile renderer, and
has been aligned/signed/verified locally. See [Android QA](docs/ANDROID_QA.md)
for the current build hash and the remaining physical-device performance gate.

## Content and architecture

- `content/alpha-0.3.0/bundle.json` is the authored gameplay/content source.
- `client-godot/assets/asset_manifest.json` maps approved runtime visuals.
- [Architecture](docs/ARCHITECTURE.md), [decisions](docs/DECISIONS.md), and the
  [release checklist](docs/DEMO_RELEASE_CHECKLIST.md) define boundaries and
  verification evidence.
