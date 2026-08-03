extends SceneTree

const RunApiClientScript = preload("res://scripts/run_api_client.gd")

var _failed := false

func _init() -> void:
	var main_scene = load("res://scenes/main.tscn").instantiate()
	var controls_rect: Rect2 = main_scene.mobile_controls_rect()
	if not _expect(controls_rect.position.y >= 0.0 and controls_rect.end.y <= 1920.0, "mobile controls must remain inside the portrait viewport"):
		main_scene.free()
		_finish()
		return
	if not main_scene.has_method("load_replay") or not main_scene.has_method("advance_replay"):
		main_scene.free()
		_fail("Main scene must expose normal replay controls")
		_finish()
		return
	if not _expect(main_scene.has_method("apply_run_view"), "main scene must accept an authoritative run view"):
		main_scene.free()
		_finish()
		return
	if not _expect(main_scene.has_method("attach_run_api"), "main scene must connect a run API client"):
		main_scene.free()
		_finish()
		return
	if not _expect(main_scene.has_method("request_buy_shop_slot") and main_scene.has_method("request_move_bench_hero") and main_scene.has_method("request_refresh_shop") and main_scene.has_method("request_sell_hero") and main_scene.has_method("request_equip_item") and main_scene.has_method("request_unequip_item") and main_scene.has_method("request_claim_reward_hero"), "main scene must expose authoritative shop, bench, and reward-hero commands"):
		main_scene.free()
		_finish()
		return
	if not _expect(main_scene.has_method("request_new_run") and main_scene.has_method("request_resume_run") and main_scene.has_method("request_select_reward") and main_scene.has_method("request_ack_unique_reveal"), "main scene must expose server-backed run and reward actions"):
		main_scene.free()
		_finish()
		return
	var api = RunApiClientScript.new()
	main_scene.attach_run_api(api)
	api.combat_events_received.emit([{ "sequence": 0, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "player:H20:stream", "payload": { "side": "player", "position": 22, "max_hp": 95000 } }])
	if not _expect(main_scene.unit_views.has("player:H20:stream"), "authoritative combat event streams must create replay units"):
		main_scene.free()
		_finish()
		return
	var emitted_commands: Array = []
	main_scene.command_requested.connect(func(payload: Dictionary) -> void: emitted_commands.append(payload))
	var lifecycle_errors: Array[String] = []
	api.request_failed.connect(func(message: String) -> void: lifecycle_errors.append(message))
	main_scene.request_new_run("run-ui-new")
	if not _expect(lifecycle_errors == ["API client is not ready"], "new run action must delegate creation to the API client"):
		main_scene.free()
		_finish()
		return
	lifecycle_errors.clear()
	main_scene.request_resume_run("run-ui-resume")
	if not _expect(lifecycle_errors == ["API client is not ready"], "resume action must delegate to the API client with the requested run ID"):
		main_scene.free()
		_finish()
		return
	api.run_view_received.emit({
		"id": "run-ui",
		"state": "PREPARE",
		"round": 1,
		"revision": 0,
		"gold": 8,
		"health": 30,
		"shop": [{ "heroId": "H01", "cost": 1 }, { "heroId": "H02", "cost": 2 }, { "heroId": "H03", "cost": 1 }, { "heroId": "H04", "cost": 3 }],
		"bench": [{ "instanceId": "hero-bench", "heroId": "H01", "cost": 1, "stars": 1 }],
		"board": [null, null, null, null, null, null, null, null, null, null, null, null],
		"items": [{ "instanceId": "item-normal", "itemId": "I01", "kind": "normal" }, { "instanceId": "item-unique", "itemId": "U01", "kind": "unique", "equippedHeroInstanceId": "hero-bench" }],
	})
	api.combat_events_received.emit([{ "sequence": 0, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "player:hero-bench", "payload": { "side": "player", "position": 22, "max_hp": 100000 } }])
	var live_portrait = main_scene.unit_views["player:hero-bench"].get_node_or_null("Portrait")
	if not _expect(live_portrait != null and live_portrait.texture.resource_path == "res://assets/sprites/h01-cotton-shield-cat-chibi-v2.png", "live server unit IDs must resolve to their authoritative hero sprite"):
		main_scene.free()
		_finish()
		return
	if not _expect(main_scene.unit_views["player:hero-bench"].unique_item_id == "U01", "an equipped Unique must render its transformation on the authoritative holder"):
		main_scene.free()
		_finish()
		return
	var unique_accessory = main_scene.unit_views["player:hero-bench"].get_node_or_null("UniqueAccessory")
	if not _expect(unique_accessory != null and unique_accessory.texture.resource_path == "res://assets/transformations/u01-lion-crown-v1.png", "U01 must render its lion-crown transformation sprite at the configured anchor"):
		main_scene.free()
		_finish()
		return
	if not _expect(main_scene.prepare_screen != null and main_scene.prepare_screen.find_child("BuySlot0", true, false) != null, "the routed Prepare shell must render authoritative shop controls"):
		main_scene.free()
		_finish()
		return
	main_scene.prepare_screen.find_child("BuySlot0", true, false).pressed.emit()
	if not _expect(emitted_commands == [{ "command_id": "client-buy-0-0", "expected_run_revision": 0, "type": "BUY_SHOP_HERO", "shop_slot_index": 0 }], "Prepare shop intents must bridge to authoritative controller requests"):
		main_scene.free()
		_finish()
		return
	emitted_commands.clear()
	main_scene.request_buy_shop_slot(0)
	main_scene.request_move_bench_hero("hero-bench", 12)
	main_scene.request_refresh_shop()
	main_scene.request_sell_hero("hero-bench")
	main_scene.request_equip_item("item-normal", "hero-bench")
	main_scene.request_unequip_item("item-unique")
	if not _expect(emitted_commands.size() == 6 and emitted_commands[0] == { "command_id": "client-buy-0-0", "expected_run_revision": 0, "type": "BUY_SHOP_HERO", "shop_slot_index": 0 } and emitted_commands[1] == { "command_id": "client-move-0-hero-bench", "expected_run_revision": 0, "type": "MOVE_HERO", "hero_instance_id": "hero-bench", "destination": 12 } and emitted_commands[2] == { "command_id": "client-refresh-0", "expected_run_revision": 0, "type": "REFRESH_SHOP" } and emitted_commands[3] == { "command_id": "client-sell-0-hero-bench", "expected_run_revision": 0, "type": "SELL_HERO", "hero_instance_id": "hero-bench" } and emitted_commands[4] == { "command_id": "client-equip-0-item-normal-hero-bench", "expected_run_revision": 0, "type": "EQUIP_ITEM", "item_instance_id": "item-normal", "hero_instance_id": "hero-bench" } and emitted_commands[5] == { "command_id": "client-unequip-0-item-unique", "expected_run_revision": 0, "type": "UNEQUIP_ITEM", "item_instance_id": "item-unique" }, "shop, bench, and item actions must emit server command payloads without local mutation"):
		main_scene.free()
		_finish()
		return
	emitted_commands.clear()
	api.run_view_received.emit({
		"id": "run-ui", "state": "REWARD", "round": 1, "revision": 2, "gold": 8, "health": 30, "shop": [], "bench": [], "board": [],
		"items": [{ "instanceId": "unique:run-ui:U01", "itemId": "U01", "kind": "unique" }],
		"roundRewardPlan": { "round": 1, "offers": [
			{ "id": "reward:1:normal_item_choice:0", "kind": "normal_item_choice", "options": [{ "id": "I01", "kind": "normal_item" }, { "id": "I02", "kind": "normal_item" }] },
			{ "id": "reward:1:hero_choice:1", "kind": "hero_choice", "options": [{ "id": "H02", "kind": "hero", "cost": 2 }, { "id": "H03", "kind": "hero", "cost": 1 }] },
		] },
	})
	main_scene.request_select_reward("reward:1:normal_item_choice:0", "I01")
	_expect(emitted_commands.is_empty(), "reward must wait for a selection from every offer")
	main_scene.request_select_reward("reward:1:hero_choice:1", "H02")
	if not _expect(emitted_commands == [{ "command_id": "client-reward-2", "expected_run_revision": 2, "type": "CLAIM_ROUND_REWARD", "reward_selections": [{ "offer_id": "reward:1:normal_item_choice:0", "option_id": "I01" }, { "offer_id": "reward:1:hero_choice:1", "option_id": "H02" }] }], "all reward choices must submit one authoritative claim command"):
		main_scene.free()
		_finish()
		return
	emitted_commands.clear()
	main_scene.request_ack_unique_reveal("unique:run-ui:U01")
	if not _expect(emitted_commands == [{ "command_id": "client-unique-reveal-2-unique:run-ui:U01", "expected_run_revision": 2, "type": "ACK_UNIQUE_REVEAL", "reveal_id": "unique:run-ui:U01" }], "Unique reveal acknowledgement must be sent with its immutable reveal ID"):
		main_scene.free()
		_finish()
		return
	emitted_commands.clear()
	api.run_view_received.emit({ "id": "run-ui", "state": "PREPARE", "round": 2, "revision": 3, "gold": 13, "health": 30, "shop": [], "bench": [], "board": [], "rewardHeroes": [{ "instanceId": "reward-hero-1", "heroId": "H02", "cost": 2, "stars": 1 }] })
	main_scene.request_claim_reward_hero("reward-hero-1")
	if not _expect(emitted_commands == [{ "command_id": "client-claim-reward-3-reward-hero-1", "expected_run_revision": 3, "type": "CLAIM_REWARD_HERO", "hero_instance_id": "reward-hero-1" }], "claimed reward hero must be sent to the server before it enters the Bench"):
		main_scene.free()
		_finish()
		return
	api.run_view_received.emit({
		"id": "run-ui", "state": "PREPARE", "round": 1, "revision": 1, "gold": 7, "health": 30, "shop": [], "bench": [],
		"board": [{ "instanceId": "hero-board", "heroId": "H01", "cost": 1, "stars": 1 }],
	})
	if not _expect(main_scene.screen_router.current_screen_id == "prepare" and not main_scene.prepare_screen.find_child("StartRound", true, false).disabled, "Prepare shell must enable Start Round only with a board hero"):
		main_scene.free()
		_finish()
		return
	api.run_view_received.emit({ "id": "run-ui", "state": "COMBAT", "round": 1, "revision": 1, "gold": 8, "health": 30, "shop": [], "bench": [], "board": [] })
	if not _expect(main_scene.screen_router.current_screen_id == "combat", "combat state must replace the Prepare action rail"):
		main_scene.free()
		_finish()
		return

	main_scene.load_replay("res://fixtures/combat-replay.json")
	for _step in 4:
		main_scene.advance_replay(0.05)
	_expect(main_scene.status_text.begins_with("Combat ended:"), "main scene must reach terminal combat status")
	main_scene.free()
	_finish()

func _expect(condition: bool, message: String) -> bool:
	if not condition:
		_fail(message)
	return condition

func _fail(message: String) -> void:
	_failed = true
	push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS main_scene_smoke_test")
	quit(0)
