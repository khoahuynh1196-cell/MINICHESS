# Full PvE Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a polished, original 2D chibi-fantasy, eight-round PvE auto-battler demo for Android.

**Architecture:** Keep deterministic combat in `game-core` and authoritative run mutations in `server`; extend both through versioned content. Rebuild the Godot client as feature-sized presentation components that consume server views and combat events, use local continuation only for a demo-safe offline run, and keep all presentation assets data-addressable through visual profiles.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces, deterministic fixed-point game-core, Fastify/Postgres server, Godot 4.7/GDScript, Android Vulkan/mobile renderer.

## Global Constraints

- Preserve server authority for pool, rewards, combat seed, combat result, and currency.
- Use only original art, text, iconography, sounds, and generated assets; never copy TFT content or layout.
- Support a 1080 x 1920 portrait viewport, safe areas, 44 x 44 minimum touch targets, and 8-pixel touch gaps.
- Keep the existing 3 x 8 logical board and deterministic replay contract.
- Treat all hero, trait, skill, item, encounter, reward, and visual-profile values as versioned content, not hero-ID branches in code.
- Every task starts by adding a focused failing test, then implements the smallest change that makes it pass, then runs the affected suite before its commit.

---

### Task 1: Establish the full-demo content contract

**Files:**
- Modify: `game-core/src/content/types.ts`, `game-core/src/content/compiler.ts`, `game-core/test/content/compiler.test.ts`
- Modify: `docs/CONTENT_CONTRACT.md`

**Interfaces:**
- Produces `RawHero` fields `rarity`, `tags`, and `is_unique_hero`; `RawVisualProfile` fields `ability_icon_key` and `vfx_key`; `RawEncounter` fields `biome` and `kind`.
- Produces `ContentManifest` counts for shop heroes and Unique heroes.

- [ ] Add compiler tests that reject a hero with an invalid rarity, a Unique hero marked as purchasable, an encounter without a legal biome, and a visual profile without icon/VFX keys.
- [ ] Run `pnpm --filter @auto-battler/game-core test -- compiler.test.ts` and confirm the new cases fail against the current contract.
- [ ] Add the typed fields and validation: rarities are `1..5`, `biome` is `meadow|ruins|frost_keep|ember_citadel`, and every visual profile references sprite, portrait, ability icon, and cast VFX keys.
- [ ] Update `docs/CONTENT_CONTRACT.md` with the canonical JSON examples, the 20 shop / 0 Unique hero baseline, and the deferred future Unique-hero capability.
- [ ] Re-run the compiler test and commit `feat: extend content contract for full PvE demo`.

### Task 2: Complete metadata for the initial 20-hero roster and five traits

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`
- Modify: `game-core/test/content/alpha-bundle.test.ts`, `game-core/test/content/content-golden.test.ts`

**Interfaces:**
- Consumes the Task 1 content schema.
- Produces metadata for H01–H20, five faction traits, five class traits, 20 standard pool entries, and no Unique hero records.

- [ ] Write assertions that the bundle contains exactly 20 shop-eligible heroes H01–H20, no `is_unique_hero` records, five factions, and five classes.
- [ ] Run the alpha-bundle test and confirm it fails until the existing 20 records include the required metadata.
- [ ] Add display keys, faction/class IDs, rarity, cost, tags, base stats, star multipliers, skills, visual-profile links, ability-icon/VFX keys, and encounter biome/kind fields to the existing H01–H20 data; keep every hero shop eligible.
- [ ] Preserve the checked-in trait breakpoints and use only content-defined effects legal under `GAME_RULES.md`.
- [ ] Refresh the golden digest intentionally and run `pnpm --filter @auto-battler/game-core test -- alpha-bundle.test.ts content-golden.test.ts`.
- [ ] Commit `feat: add full PvE hero roster and traits`.

### Task 3: Complete skills, 12 basic items, and six Unique items

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`
- Modify: `game-core/test/effects/definitions.test.ts`, `game-core/test/simulation/kernel.test.ts`, `game-core/test/content/alpha-bundle.test.ts`

**Interfaces:**
- Consumes content `S_H01` through `S_H20`, `I01` through `I12`, and `U01` through `U06`.
- Produces skill/effect coverage for damage, heal, shield, stun, slow, buff, debuff, summon, cleanse, dash, and knockback.

- [ ] Add focused kernel tests for one content-driven skill of each primitive and an item/Unique trigger that activates exactly once when required.
- [ ] Run the focused tests and confirm each new effect case fails before content is added.
- [ ] Define 20 readable skills, 12 basic items (four offensive, four defensive, four utility), and preserve U01–U06 with legal effects and visual transformations.
- [ ] Add content validation assertions that no item references an unknown effect, visual profile, or transformation.
- [ ] Run `pnpm --filter @auto-battler/game-core test` and commit `feat: add PvE skills items and unique rewards`.

### Task 4: Implement shop-pool data and deterministic roll odds

**Files:**
- Create: `server/src/application/shop-pool.ts`
- Create: `server/test/shop-pool.test.ts`
- Modify: `server/src/application/run-commands.ts`, `server/src/runtime.ts`

**Interfaces:**
- Produces `createShopPool(content, runSeed): ShopPool` and `rollShop(pool, level, stream): ShopSlot[]`.
- `ShopGenerator` uses a shop pool rather than fixed hardcoded hero arrays.

- [ ] Write tests that shop rolls exclude Unique heroes, remove bought copies from the pool, return sold copies, use five slots, and give deterministic results for equal seed/level/refresh number.
- [ ] Run `pnpm --filter @auto-battler/server test -- shop-pool.test.ts` and confirm imports/functions are absent.
- [ ] Implement tier odds by level, seeded stream `shop:<round>:<refresh>`, pool conservation, and five slot generation using the compiled bundle.
- [ ] Adapt `createRun` and `REFRESH_SHOP` to persist pool state and consume free refreshes before two gold.
- [ ] Run `pnpm --filter @auto-battler/server test -- shop-pool.test.ts run-commands.test.ts` and commit `feat: add deterministic shared hero shop pool`.

### Task 5: Add XP, player level, and board-cap progression

**Files:**
- Modify: `server/src/application/run-commands.ts`, `server/src/http/app.ts`, `server/src/runtime.ts`
- Modify: `server/test/run-commands.test.ts`, `server/test/http.test.ts`
- Modify: `client-godot/scripts/run_state.gd`, `client-godot/test/run_state_test.gd`

**Interfaces:**
- Adds command type `BUY_XP` and public run-view fields `level`, `experience`, `experienceToNext`, and `boardCap`.
- Produces `RunState.can_buy_xp()` and fields consumed by the Prepare HUD.

- [ ] Add server tests for a four-gold XP purchase, level advancement, level cap, revision/idempotency, and board-cap enforcement.
- [ ] Add Godot parsing tests for the new public view fields.
- [ ] Implement `BUY_XP`, derive level/odds/board cap deterministically, serialise it in the run API, and expose it through `RunState`.
- [ ] Run both server and Godot focused tests and commit `feat: add level and XP progression`.

### Task 6: Complete 8-round encounter, affix, and reward content

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`
- Modify: `game-core/test/content/alpha-bundle.test.ts`, `server/test/reward-selection.test.ts`, `server/test/runtime.test.ts`

**Interfaces:**
- Produces eight ordered encounters with biomes, R4 Unique reveal, R4 miniboss, R8 boss, and deterministic reward plans.

- [ ] Add tests for exact enemy counts `2,3,3,4,4,5,5,6`, R4 Unique-item reveal, R5 affix, R8 final chest, and legal enemy positions.
- [ ] Run the tests and confirm the bundle lacks the visual encounter metadata and final reward rules.
- [ ] Populate encounter `kind`, `biome`, enemy roster, multiplier, affix, and reward plan for rounds one to eight.
- [ ] Keep reward selection free of Unique heroes; defer H21–H24 reward candidates to a later release while retaining the existing Unique-item reward flow.
- [ ] Run game-core/server suites and commit `feat: complete eight-round PvE encounter content`.

### Task 7: Make local run persistence/resume demo-safe

**Files:**
- Create: `client-godot/scripts/local_run_store.gd`
- Create: `client-godot/test/local_run_store_test.gd`
- Modify: `client-godot/scripts/run_state.gd`, `client-godot/scripts/battle_controller.gd`

**Interfaces:**
- Produces `LocalRunStore.save_run(view: Dictionary)`, `load_run() -> Dictionary`, and `clear_run()`.
- Godot applies only server/public run views; no client-side combat or reward resolution is introduced.

- [ ] Add tests for save/load round-trip, schema version mismatch, corrupt JSON rejection, and reset removal.
- [ ] Run the new Godot test and confirm `LocalRunStore` does not exist.
- [ ] Implement user-data JSON storage with a schema version and wire save after accepted public views, resume from a valid local view, and clear after recap/reset.
- [ ] Run the local-store and run-state tests and commit `feat: persist and resume local PvE run views`.

### Task 8: Introduce a reusable mobile design system and screen router

**Files:**
- Create: `client-godot/scripts/ui/theme_tokens.gd`, `client-godot/scripts/ui/screen_router.gd`
- Create: `client-godot/test/screen_router_test.gd`
- Modify: `client-godot/scenes/main.tscn`, `client-godot/scripts/battle_controller.gd`

**Interfaces:**
- Produces `ThemeTokens` semantic colours/spacing/type scales and `ScreenRouter.show_screen(screen_id: String)`.
- Valid screen IDs are `lobby`, `map`, `prepare`, `combat`, `reward`, `recap`, `collection`, and `settings`.

- [ ] Add a router test that visits each screen, ensures one visible root screen, and rejects an unknown ID without changing the current screen.
- [ ] Run it to confirm the router is absent.
- [ ] Create semantic navy/stone/parchment/gold/player/enemy tokens, reduced-motion switch, and a CanvasLayer router; replace direct debug-control construction with routed screen roots.
- [ ] Run `main_scene_smoke_test.gd` and `screen_router_test.gd`, capture a portrait lobby screenshot, then commit `feat: add mobile screen router and theme tokens`.

### Task 9: Build Lobby, encounter-map, and settings screens

**Files:**
- Create: `client-godot/scripts/ui/lobby_screen.gd`, `client-godot/scripts/ui/encounter_map_screen.gd`, `client-godot/scripts/ui/settings_screen.gd`
- Create: `client-godot/test/lobby_screen_test.gd`
- Modify: `client-godot/scripts/ui/screen_router.gd`, `client-godot/scripts/battle_controller.gd`

**Interfaces:**
- Lobby emits `start_pve_requested`, `continue_requested`, `collection_requested`, and `settings_requested`.
- Encounter map accepts `set_encounters(encounters: Array, current_round: int)` and emits `encounter_selected(round: int)`.

- [ ] Test enabled/disabled Continue Run, exactly eight encounter nodes, boss/miniboss markers, and persisted settings toggles.
- [ ] Implement the screens with original art panels, textual labels, press feedback, safe-area layout, and 44-pixel targets.
- [ ] Run the screen tests and main smoke test, capture lobby/map screenshots, and commit `feat: add lobby map and settings screens`.

### Task 10: Replace debug controls with the Prepare screen shell

**Files:**
- Create: `client-godot/scripts/ui/prepare_screen.gd`, `client-godot/test/prepare_screen_test.gd`
- Modify: `client-godot/scripts/battle_controller.gd`, `client-godot/test/main_scene_smoke_test.gd`

**Interfaces:**
- `PrepareScreen.bind_run(view: Dictionary)` renders header, board, bench, trait panel, inventory, shop, and action rail.
- Emits typed intents `buy_shop_slot(index)`, `refresh_shop()`, `lock_shop()`, `buy_xp()`, `start_round()`, and `sell_hero(instance_id)`.

- [ ] Test that all core controls lie inside 1080 x 1920, are disabled outside PREPARE, and update gold/HP/level labels from a fixture.
- [ ] Implement the shell with no direct server mutation; bridge intents to existing `BattleController.request_*` methods.
- [ ] Remove the old stacked debug control panel only after all equivalent actions are present in Prepare.
- [ ] Run Godot UI tests and commit `feat: add production prepare screen shell`.

### Task 11: Implement board/bench drag-drop placement and sell interactions

**Files:**
- Create: `client-godot/scripts/ui/formation_controller.gd`, `client-godot/test/formation_controller_test.gd`
- Modify: `client-godot/scripts/ui/prepare_screen.gd`, `client-godot/scripts/battle_controller.gd`, `client-godot/scripts/run_state.gd`

**Interfaces:**
- Produces `FormationController.request_move(instance_id, destination)` and `request_return_to_bench(instance_id)`.
- Uses public board cells 12–23 and eight bench slots; it emits intents but does not resolve validity locally.

- [ ] Test valid bench-to-board, board-to-board swap, board-to-bench, occupied bench, and COMBAT-state rejection.
- [ ] Implement touch drag ghost, drop highlighting, accessible tap fallback, and server-command bridge including a new `MOVE_HERO` return-to-bench destination contract if required.
- [ ] Run formation/run-command tests and commit `feat: add formation drag drop controls`.

### Task 12: Build hero shop cards, odds, lock, buy, and sell presentation

**Files:**
- Create: `client-godot/scripts/ui/hero_card.gd`, `client-godot/scripts/ui/shop_panel.gd`, `client-godot/test/shop_panel_test.gd`
- Modify: `client-godot/scripts/ui/prepare_screen.gd`, `client-godot/scripts/run_state.gd`

**Interfaces:**
- `HeroCard.configure(hero: Dictionary, catalog: Dictionary)` renders portrait, cost, rarity, star, faction/class, and disabled state.
- `ShopPanel.bind_shop(slots: Array, odds: Dictionary, locked: bool)` emits buy/refresh/lock intents.

- [ ] Test five cards, Unique absence, cost/rarity representation, disabled buy at insufficient gold/full bench, and odds updates on level change.
- [ ] Implement five-card responsive shop panel, lock state, tier-odds sheet, and buy/sell feedback using semantic tokens.
- [ ] Run shop/Prepare tests, capture a populated shop screenshot, and commit `feat: add shop cards odds and lock UI`.

### Task 13: Build traits, star-upgrade, and item-inventory UI

**Files:**
- Create: `client-godot/scripts/ui/trait_panel.gd`, `client-godot/scripts/ui/item_inventory.gd`, `client-godot/test/item_inventory_test.gd`
- Modify: `client-godot/scripts/ui/prepare_screen.gd`, `client-godot/scripts/battle_controller.gd`

**Interfaces:**
- Trait panel receives board heroes and catalog data and exposes active 2/4/6 breakpoints.
- Inventory emits `equip_requested(item_instance_id, hero_instance_id)` and `unequip_requested(item_instance_id)`.

- [ ] Test active trait counting ignores bench/duplicates, three-copy star presentation, two-item limit feedback, and one-Unique-per-hero feedback.
- [ ] Implement bottom-sheet trait chips, star combine celebration with reduced-motion alternative, item drag/tap equip, and tooltip data from content.
- [ ] Run client tests plus `server/test/run-commands.test.ts` item tests and commit `feat: add trait upgrade and item UI`.

### Task 14: Generate and register original art packs

**Files:**
- Create: `client-godot/assets/heroes/`, `client-godot/assets/ui/`, `client-godot/assets/biomes/`, `client-godot/assets/vfx/`, `client-godot/assets/items/`
- Create: `client-godot/assets/asset_manifest.json`
- Modify: `content/alpha-0.3.0/bundle.json`, `game-core/test/content/alpha-bundle.test.ts`

**Interfaces:**
- Every `visual_profile_id` resolves to portrait, sprite, icon, VFX, and six animation frames in `asset_manifest.json`.
- Asset manifest keys match bundle keys exactly.

- [ ] Add a manifest test that fails on a missing hero portrait, animation state, item icon, biome layer, or Unique transformation.
- [ ] Generate original chibi-fantasy asset batches by faction/class using the approved warm-outline direction; create sprite sheets, portraits, item/trait icons, four board kits, and lightweight VFX frames.
- [ ] Pack assets into mobile-friendly texture atlases and declare every resulting key in the manifest.
- [ ] Run the manifest/content tests, manually inspect sheets at native resolution, and commit `feat: add original chibi fantasy art packs`.

### Task 15: Upgrade unit and board presentation to data-driven sprites

**Files:**
- Create: `client-godot/scripts/asset_catalog.gd`, `client-godot/test/asset_catalog_test.gd`
- Modify: `client-godot/scripts/unit_view.gd`, `client-godot/scripts/battle_controller.gd`, `client-godot/scenes/main.tscn`

**Interfaces:**
- `AssetCatalog.hero_profile(hero_id)` returns portrait/sprite/icon/VFX data; `UnitView.configure` consumes a profile rather than a colour-only hero ID.

- [ ] Test H01–H20 profile resolution, fallback rejection in release mode, visual state mapping for idle/move/basic/cast/hit/death, and existing hero-ID label preservation for debug builds.
- [ ] Implement atlas-backed Sprite2D/AnimatedSprite2D nodes, class-timing animations, hp/mana/status indicators, side outlines, and four biome board layers.
- [ ] Run unit animation, catalog, and scene smoke tests; capture a full combat screenshot; commit `feat: render data-driven hero sprites and biomes`.

### Task 16: Add combat HUD, event VFX, camera, and recap data

**Files:**
- Create: `client-godot/scripts/ui/combat_hud.gd`, `client-godot/scripts/combat_vfx_pool.gd`, `client-godot/scripts/ui/run_recap_screen.gd`
- Create: `client-godot/test/combat_hud_test.gd`, `client-godot/test/combat_vfx_pool_test.gd`
- Modify: `client-godot/scripts/battle_controller.gd`, `client-godot/scripts/unit_view.gd`

**Interfaces:**
- `CombatHud.bind_snapshot(snapshot)` and `CombatVfxPool.present(event)` consume presentation events only.
- Recap accepts `{ winner, round, mvp, damageByHero, healByHero, activeTraits }` without recalculating combat.

- [ ] Test pause/speed controls, accessible event labels, VFX pool reuse, damage/heal/shield/CC visual routing, and recap win/defeat copy.
- [ ] Implement combat transition, camera emphasis on casts/boss, floating combat text, pooled VFX, two speed buttons, pause, reduced-motion mode, and recap screen.
- [ ] Run Godot tests and capture combat/victory/defeat screenshots; commit `feat: add combat HUD VFX and run recap`.

### Task 17: Implement reward, Unique-item reveal, and collection screens

**Files:**
- Create: `client-godot/scripts/ui/reward_screen.gd`, `client-godot/scripts/ui/collection_screen.gd`
- Create: `client-godot/test/reward_screen_test.gd`, `client-godot/test/collection_screen_test.gd`
- Modify: `client-godot/scripts/battle_controller.gd`, `client-godot/scripts/ui/screen_router.gd`

**Interfaces:**
- Reward screen renders only server-offered choices and emits `select_reward(offer_id, option_id)` and `ack_unique(reveal_id)` for existing Unique items; Unique heroes remain deferred.
- Collection screen loads all 20 current profiles, filters faction/class, and shows the existing Unique-item codex; future Unique heroes remain deferred.

- [ ] Test three-option selection, mandatory selection before claim, round-four Unique-item reveal, no client-generated option, filters, and 20-card collection count.
- [ ] Implement reward cards, reveal animation/reduced-motion fallback, item/hero claim path, Collection grid, detail modal, and filters.
- [ ] Run Godot/server reward tests, capture reward and collection screenshots, and commit `feat: add reward unique and collection screens`.

### Task 18: Add audio, haptics, loading/error feedback, and localisation catalog

**Files:**
- Create: `client-godot/scripts/audio_feedback.gd`, `client-godot/scripts/localization_catalog.gd`, `client-godot/assets/audio/`, `client-godot/assets/localization/en.json`, `client-godot/assets/localization/vi.json`
- Create: `client-godot/test/audio_feedback_test.gd`, `client-godot/test/localization_catalog_test.gd`
- Modify: `client-godot/project.godot`, `client-godot/scripts/ui/theme_tokens.gd`

**Interfaces:**
- `AudioFeedback.play_cue(cue_id)` and `request_haptic(kind)` respect user settings.
- `LocalizationCatalog.text(key, variables := {})` resolves all player-visible content keys.

- [ ] Test disabled sound/haptic, missing cue/key diagnostics, English/Vietnamese lookup, and no raw display keys in hero/shop/reward UI.
- [ ] Add original UI/combat cues, haptic only for buy/combine/reward/defeat events, loading spinner, recoverable error banner, and en/vi catalogs.
- [ ] Run focused tests and scene smoke test, then commit `feat: add game feedback and localisation`.

### Task 19: Android build, performance, and accessibility verification

**Files:**
- Modify: `client-godot/export_presets.cfg`, `client-godot/project.godot`
- Create: `docs/ANDROID_QA.md`, `client-godot/test/mobile_ui_accessibility_test.gd`

**Interfaces:**
- Produces an Android APK using the mobile renderer and a repeatable test checklist for reference device measurements.

- [ ] Write a headless UI test for viewport bounds, 44-pixel targets, visible disabled state, text alternatives for icon controls, and reduced-motion presentation.
- [ ] Configure Android export, texture compression, orientation lock, safe-area handling, and release/debug build variants.
- [ ] Profile a complete 8-round run, measure frame time and texture memory, then reduce atlas/VFX load until 60 FPS target is met on the agreed device.
- [ ] Build an APK, install/test all screen transitions, and record results in `docs/ANDROID_QA.md` with device, build hash, FPS, memory, and failures.
- [ ] Commit `build: verify Android PvE demo performance and accessibility`.

### Task 20: Full regression, screenshots, release candidate, and handoff

**Files:**
- Modify: `README.md`, `docs/ARCHITECTURE.md`, `docs/DECISIONS.md`
- Create: `docs/DEMO_RELEASE_CHECKLIST.md`, `tmp/screenshots/full-pve-demo/`

**Interfaces:**
- Produces a documented release candidate with reproducible test/build commands and visual proof of every primary state.

- [ ] Run `pnpm --filter @auto-battler/game-core test`, `pnpm --filter @auto-battler/server test`, all Godot headless tests, `git diff --check`, and an Android export.
- [ ] Capture real portrait screenshots for lobby, map, Prepare, populated shop, item/trait state, combat, R4 reward/Unique, R8 boss, victory, defeat, and collection.
- [ ] Verify a fresh install can start, save/resume, finish or lose a run, return to lobby, and access every collection card without debug controls.
- [ ] Document installation, controls, architecture boundaries, content editing workflow, known non-goals, and release evidence.
- [ ] Commit `docs: publish full PvE demo release checklist` after all commands and screenshots pass.

## Self-Review

- Spec coverage: Tasks 1–6 cover data/content/economy/PvE; 7–13 cover the playable preparation loop; 14–18 cover original art, combat, reward, collection, feedback, and localisation; 19–20 cover Android quality and delivery.
- Placeholder scan: this plan contains no deferred implementation markers; every task names files, interfaces, test expectations, and a commit boundary.
- Type consistency: game-core content is compiled into server shop/run state; server public view is parsed by `RunState`; Godot screen components only emit commands or render authoritative result data.
