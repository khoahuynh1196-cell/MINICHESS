extends Node2D

const UnitViewScript = preload("res://scripts/unit_view.gd")
const MonsterViewScript = preload("res://scripts/presentation/monster_view.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const ReplayLoaderScript = preload("res://scripts/replay_loader.gd")
const ReplaySchedulerScript = preload("res://scripts/replay_scheduler.gd")
const CombatEventScript = preload("res://scripts/combat_event.gd")
const RunStateScript = preload("res://scripts/run_state.gd")
const RunApiClientScript = preload("res://scripts/run_api_client.gd")
const LocalRunStoreScript = preload("res://scripts/local_run_store.gd")
const ScreenRouterScript = preload("res://scripts/ui/screen_router.gd")
const PrepareScreenScript = preload("res://scripts/ui/prepare_screen.gd")
const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const SettingsStoreScript = preload("res://scripts/ui/settings_store.gd")
const FormationControllerScript = preload("res://scripts/ui/formation_controller.gd")
const TraitSummaryScript = preload("res://scripts/ui/trait_summary.gd")
const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const LocalizationCatalogScript = preload("res://scripts/localization_catalog.gd")
const AudioFeedbackScript = preload("res://scripts/audio_feedback.gd")
const FeedbackOverlayScript = preload("res://scripts/ui/feedback_overlay.gd")
const CombatHudScript = preload("res://scripts/ui/combat_hud.gd")
const CombatVfxPoolScript = preload("res://scripts/combat_vfx_pool.gd")
const RunRecapScreenScript = preload("res://scripts/ui/run_recap_screen.gd")
const BOARD_COLUMNS := 4
const BOARD_ROWS := 8
const CELL_WIDTH := 250.0
const CELL_HEIGHT := 120.0
const BOARD_ORIGIN := Vector2(40.0, 190.0)
const BOARD_RECT := Rect2(BOARD_ORIGIN, Vector2(CELL_WIDTH * BOARD_COLUMNS, CELL_HEIGHT * BOARD_ROWS))
const COMBAT_NOTICE_BODY_FONT_SIZE := 20.0
const COMBAT_NOTICE_BODY_LINES := 4.0
const COMBAT_NOTICE_VERTICAL_PADDING := 44.0
const CONTENT_VERSION := "alpha-0.3.0"
const MOBILE_CONTROLS_RECT := Rect2(24.0, 1110.0, 1032.0, 760.0)
const ADVENTURE_BIOMES := ["meadow", "meadow", "ruins", "ruins", "frost_keep", "frost_keep", "ember_citadel", "ember_citadel"]

var unit_views: Dictionary = {}
var status_text := "Waiting for replay"
var status_label: Label
var mobile_status_label: Label
var run_label: Label
var shop_label: Label
var bench_label: Label
var shop_actions: HBoxContainer
var bench_actions: HBoxContainer
var item_label: Label
var item_actions: HBoxContainer
var reward_label: Label
var reward_actions: VBoxContainer
var new_run_button: Button
var resume_run_input: LineEdit
var resume_run_button: Button
var refresh_shop_button: Button
var start_round_button: Button
var run_state = RunStateScript.new()
var local_run_store = LocalRunStoreScript.new()
var settings_store = SettingsStoreScript.new()
var settings: Dictionary = {}
var run_api_client
var screen_router
var prepare_screen
var legacy_controls_layer: CanvasLayer
var _public_run_view: Dictionary = {}
var _unknown_event_types: Dictionary = {}
var _scheduler
var _replay_path := "res://fixtures/combat-replay.json"
var _paused := false
var _playback_speed := 1.0
var _reward_selections: Dictionary = {}
var _acknowledged_reveals: Dictionary = {}
var formation_controller = FormationControllerScript.new()
var localization = LocalizationCatalogScript.new()
var audio_feedback = AudioFeedbackScript.new()
var feedback_overlay
var _retry_request: Callable
var _selected_item_instance_id := ""
var _item_feedback := ""
var _star_upgrade: Dictionary = {}
var _collection_species_filter := "all"
var _collection_role_filter := "all"
var _collection_detail_hero_id := ""
var _request_in_flight := false
var _pending_reward_review := false
var _mobile_pointer_sequence := 0
var combat_hud
var combat_vfx_pool
var combat_camera: Camera2D
var camera_focus_position := Vector2.ZERO

signal command_requested(payload: Dictionary)

func _ready() -> void:
	_ensure_combat_presentation()
	_create_mobile_ui()
	attach_run_api(RunApiClientScript.new())
	_resume_local_run()
	load_replay(_replay_path)
	queue_redraw()

func _process(delta: float) -> void:
	if not _paused:
		advance_replay(delta)

func _input(event: InputEvent) -> void:
	# Some Android SurfaceView/emulator combinations deliver touches to the game
	# but fail to route them through Control. Keep the normal Button UI, then
	# provide a rect-based touch path for the visible mobile screen.
	if not OS.has_feature("mobile"):
		return
	if event is InputEventScreenTouch and event.pressed:
		_mobile_pointer_sequence += 1
		if route_mobile_touch(event.position):
			get_viewport().set_input_as_handled()
	elif event is InputEventMouseButton and event.pressed and event.button_index == MOUSE_BUTTON_LEFT:
		# adb and a few Android SurfaceView implementations expose a tap as a
		# mouse click. Defer it one input turn so a paired ScreenTouch wins and
		# the same physical tap cannot activate a button twice.
		var sequence := _mobile_pointer_sequence
		call_deferred("_route_mobile_mouse_fallback", event.position, sequence)

func _route_mobile_mouse_fallback(position: Vector2, sequence: int) -> void:
	if sequence != _mobile_pointer_sequence:
		return
	if route_mobile_touch(position):
		get_viewport().set_input_as_handled()

func route_mobile_touch(position: Vector2) -> bool:
	if screen_router == null:
		return false
	var roots: Array[Control] = []
	if feedback_overlay != null and feedback_overlay.visible:
		roots.append(feedback_overlay)
	var screen: Control = screen_router.screen_root(screen_router.current_screen_id)
	if screen != null and screen.visible:
		roots.append(screen)
	for root in roots:
		var controls: Array[Node] = root.find_children("*", "Button", true, false)
		for index in range(controls.size() - 1, -1, -1):
			var button := controls[index] as Button
			if button != null and _is_visible_mobile_control(button, root) and not button.disabled and button.get_global_rect().has_point(position):
				button.pressed.emit()
				return true
	return false

func _is_visible_mobile_control(button: Button, root: Control) -> bool:
	var candidate: CanvasItem = button
	while candidate != null:
		if not candidate.visible:
			return false
		if candidate == root:
			return true
		candidate = candidate.get_parent() as CanvasItem
	return false

func load_replay(path: String) -> void:
	_replay_path = path
	_clear_unit_views()
	_unknown_event_types.clear()
	var events = ReplayLoaderScript.load_events(path)
	if events.is_empty():
		_set_status("Replay unavailable")
		_scheduler = null
		return
	_scheduler = ReplaySchedulerScript.new(events)
	_set_status("Replaying combat")
	_apply_due_events(_scheduler.advance(0.0))

func advance_replay(delta_seconds: float) -> void:
	if _scheduler == null:
		return
	_apply_due_events(_scheduler.advance(delta_seconds * _playback_speed))

func restart_replay() -> void:
	_paused = false
	load_replay(_replay_path)

func set_playback_speed(speed: float) -> void:
	_playback_speed = speed
	_bind_combat_hud()
	_set_status("Replaying combat at %s×" % speed)

func toggle_pause() -> void:
	_paused = not _paused
	_set_status("Paused" if _paused else "Replaying combat")
	_bind_combat_hud()

func apply_event(event) -> void:
	_ensure_combat_presentation()
	if combat_hud != null:
		combat_hud.present_event(event)
	if combat_vfx_pool != null:
		combat_vfx_pool.present(event)
	match event.type:
		"UNIT_SPAWNED":
			_spawn_unit(event)
		"UNIT_MOVED", "UNIT_DISPLACED":
			_move_unit(event)
		"BASIC_ATTACK":
			_present_source(event, "basic_attack")
		"CAST_STARTED", "CAST_RESOLVED":
			_present_source(event, "skill")
			_emphasize_camera(_source_unit(event))
		"DAMAGE_APPLIED":
			_update_unit_hp(event, "hit")
		"HEAL_APPLIED":
			_update_unit_hp(event, "skill")
		"MANA_CHANGED":
			_update_unit_mana(event)
		"EFFECT_APPLIED", "SHIELD_APPLIED", "STAT_MODIFIER_APPLIED":
			_present_target(event, "skill")
		"CLEANSE_APPLIED":
			_present_target_with_status(event, "", "skill")
		"STUN_APPLIED":
			_present_target_with_status(event, "stunned", "hit")
		"SLOW_APPLIED":
			_present_target_with_status(event, "slowed", "hit")
		"UNIT_DIED":
			_mark_unit_defeated(event)
		"COMBAT_ENDED":
			_set_status("Combat ended: %s" % String(event.payload.get("winner", "unknown")))
		_:
			if not _unknown_event_types.has(event.type):
				_unknown_event_types[event.type] = true
				print("Ignoring presentation-unsupported event: %s" % event.type)

func apply_run_view(view: Dictionary) -> void:
	var previous_state: String = run_state.state
	var next_state := String(view.get("state", ""))
	# Resolve-combat returns the authoritative REWARD view in one request. Keep
	# that result intact while presenting its event stream first, otherwise the
	# player never sees the actual battle on a fast local/network response.
	_pending_reward_review = next_state == "REWARD" and previous_state in ["PREPARE", "COMBAT"]
	_star_upgrade = _detect_star_upgrade(view)
	run_state.apply_public_view(view)
	_public_run_view = view.duplicate(true)
	_request_in_flight = false
	_clear_request_feedback()
	if run_state.state != "PREPARE" or (formation_controller.has_selection() and not _has_hero_instance(formation_controller.selected_hero_instance_id)):
		formation_controller.clear_selection()
	if not _selected_item_instance_id.is_empty() and not run_state.items.any(func(item): return String(item.get("instanceId", "")) == _selected_item_instance_id and not item.has("equippedHeroInstanceId")):
		_selected_item_instance_id = ""
	if _selected_item_instance_id.is_empty():
		_item_feedback = ""
	if run_state.state == "COMPLETE":
		local_run_store.clear_run()
	else:
		local_run_store.save_run(view)
	if run_state.state != "REWARD":
		_reward_selections.clear()
		_acknowledged_reveals.clear()
	_refresh_run_ui()
	if screen_router == null:
		_create_mobile_ui()
	_refresh_mobile_screen()

func build_command_payload(command_id: String, command_type: String, fields: Dictionary = {}) -> Dictionary:
	return run_state.command_payload(command_id, command_type, fields)

func request_start_round() -> void:
	if not run_state.can_start_round():
		return
	command_requested.emit(build_command_payload("client-start-%s" % run_state.revision, "START_ROUND"))

func request_new_run(requested_run_id: String = "") -> void:
	local_run_store.clear_run()
	if _request_in_flight:
		_set_status("Request already in progress")
		return
	if run_api_client == null:
		_set_status("Run API is not connected")
		return
	var run_id := requested_run_id if not requested_run_id.is_empty() else "run-%s" % Time.get_ticks_msec()
	_request_in_flight = true
	_set_status("Creating expedition...")
	_show_request_loading("Creating expedition...", request_new_run.bind(run_id))
	run_api_client.create_run(run_id, CONTENT_VERSION)

func request_resume_run(requested_run_id: String = "") -> void:
	if _request_in_flight:
		_set_status("Request already in progress")
		return
	if run_api_client == null:
		_set_status("Run API is not connected")
		return
	var run_id := requested_run_id if not requested_run_id.is_empty() else resume_run_input.text.strip_edges()
	if run_id.is_empty():
		_set_status("Enter a run ID to resume")
		return
	_request_in_flight = true
	_set_status("Resuming expedition...")
	_show_request_loading("Resuming expedition...", request_resume_run.bind(run_id))
	run_api_client.resume_run(run_id)

func _resume_local_run() -> void:
	var cached_view := local_run_store.load_run()
	if cached_view.is_empty():
		return
	var cached_run_id := String(cached_view.get("id", ""))
	if resume_run_input != null:
		resume_run_input.text = cached_run_id
	request_resume_run(cached_run_id)

func request_buy_shop_slot(shop_slot_index: int) -> void:
	if run_state.state != "PREPARE" or shop_slot_index < 0 or shop_slot_index >= run_state.shop.size():
		return
	var slot = run_state.shop[shop_slot_index]
	if slot == null or run_state.gold < int(slot.get("cost", 0)) or run_state.bench.size() >= 8:
		return
	command_requested.emit(build_command_payload("client-buy-%s-%s" % [run_state.revision, shop_slot_index], "BUY_SHOP_HERO", { "shop_slot_index": shop_slot_index }))
	audio_feedback.play_cue(self, "chime")
	audio_feedback.request_haptic("buy")

func request_refresh_shop() -> void:
	if run_state.state != "PREPARE" or run_state.shop_locked or (run_state.free_refreshes <= 0 and run_state.gold < 2):
		return
	command_requested.emit(build_command_payload("client-refresh-%s" % run_state.revision, "REFRESH_SHOP"))

func request_lock_shop() -> void:
	if run_state.state != "PREPARE":
		return
	command_requested.emit(build_command_payload("client-lock-%s" % run_state.revision, "LOCK_SHOP"))

func request_buy_xp() -> void:
	if not run_state.can_buy_xp():
		return
	command_requested.emit(build_command_payload("client-xp-%s" % run_state.revision, "BUY_XP"))

func request_sell_hero(hero_instance_id: String) -> void:
	if run_state.state != "PREPARE":
		return
	var exists_on_bench: bool = run_state.bench.any(func(hero): return String(hero.get("instanceId", "")) == hero_instance_id)
	var exists_on_board: bool = run_state.board.any(func(hero): return hero != null and String(hero.get("instanceId", "")) == hero_instance_id)
	if not exists_on_bench and not exists_on_board:
		return
	command_requested.emit(build_command_payload("client-sell-%s-%s" % [run_state.revision, hero_instance_id], "SELL_HERO", { "hero_instance_id": hero_instance_id }))

func request_equip_item(item_instance_id: String, hero_instance_id: String) -> void:
	if run_state.state != "PREPARE" or not _has_hero_instance(hero_instance_id):
		return
	var result: Dictionary = ItemInventoryScript.equip_result(run_state.items, item_instance_id, hero_instance_id)
	if not bool(result.allowed):
		_item_feedback = String(result.reason)
		_set_status(_item_feedback)
		_refresh_mobile_screen()
		return
	_selected_item_instance_id = ""
	_item_feedback = "Equip requested; awaiting server confirmation."
	_set_status(_item_feedback)
	command_requested.emit(build_command_payload("client-equip-%s-%s-%s" % [run_state.revision, item_instance_id, hero_instance_id], "EQUIP_ITEM", { "item_instance_id": item_instance_id, "hero_instance_id": hero_instance_id }))

func request_unequip_item(item_instance_id: String) -> void:
	if run_state.state != "PREPARE":
		return
	var item_is_equipped: bool = run_state.items.any(func(item): return String(item.get("instanceId", "")) == item_instance_id and item.has("equippedHeroInstanceId"))
	if not item_is_equipped:
		return
	command_requested.emit(build_command_payload("client-unequip-%s-%s" % [run_state.revision, item_instance_id], "UNEQUIP_ITEM", { "item_instance_id": item_instance_id }))

func request_select_reward(offer_id: String, option_id: String) -> void:
	if run_state.state != "REWARD":
		return
	var offers: Array = Array(run_state.round_reward_plan.get("offers", []))
	var matches := offers.filter(func(candidate): return String(candidate.get("id", "")) == offer_id)
	if matches.is_empty():
		return
	var offer = matches.front()
	if not Array(offer.get("options", [])).any(func(option): return String(option.get("id", "")) == option_id):
		return
	_reward_selections[offer_id] = option_id
	audio_feedback.play_cue(self, "chime")
	audio_feedback.request_haptic("reward")
	_refresh_reward_buttons()
	if _reward_selections.size() != offers.size():
		return
	var selections: Array = []
	for pending_offer in offers:
		var pending_offer_id := String(pending_offer.get("id", ""))
		selections.append({ "offer_id": pending_offer_id, "option_id": _reward_selections[pending_offer_id] })
	command_requested.emit(build_command_payload("client-reward-%s" % run_state.revision, "CLAIM_ROUND_REWARD", { "reward_selections": selections }))

func request_claim_reward_hero(hero_instance_id: String) -> void:
	if run_state.state != "PREPARE" or run_state.bench.size() >= 8:
		return
	if not run_state.reward_heroes.any(func(hero): return String(hero.get("instanceId", "")) == hero_instance_id):
		return
	command_requested.emit(build_command_payload("client-claim-reward-%s-%s" % [run_state.revision, hero_instance_id], "CLAIM_REWARD_HERO", { "hero_instance_id": hero_instance_id }))

func request_claim_empty_round_reward() -> void:
	if run_state.state != "REWARD" or not Array(run_state.round_reward_plan.get("offers", [])).is_empty():
		return
	command_requested.emit(build_command_payload("client-reward-%s" % run_state.revision, "CLAIM_ROUND_REWARD", { "reward_selections": [] }))

func review_pending_round_reward() -> void:
	if not _pending_reward_review:
		return
	_pending_reward_review = false
	_refresh_mobile_screen()

func request_ack_unique_reveal(reveal_id: String) -> void:
	if run_state.state != "REWARD" or _acknowledged_reveals.has(reveal_id):
		return
	var revealed_unique = run_state.items.any(func(item): return String(item.get("instanceId", "")) == reveal_id and String(item.get("kind", "")) == "unique" and not item.has("equippedHeroInstanceId"))
	if not revealed_unique:
		return
	_acknowledged_reveals[reveal_id] = true
	_refresh_reward_buttons()
	command_requested.emit(build_command_payload("client-unique-reveal-%s-%s" % [run_state.revision, reveal_id], "ACK_UNIQUE_REVEAL", { "reveal_id": reveal_id }))

func request_move_bench_hero(hero_instance_id: String, destination: int) -> void:
	if not run_state.bench.any(func(hero): return String(hero.get("instanceId", "")) == hero_instance_id):
		return
	request_move_hero(hero_instance_id, destination)

func request_move_hero(hero_instance_id: String, destination: int) -> void:
	if run_state.state != "PREPARE" or not ((destination >= 0 and destination < 8) or (destination >= 16 and destination < 32)) or not _has_hero_instance(hero_instance_id):
		return
	command_requested.emit(build_command_payload("client-move-%s-%s" % [run_state.revision, hero_instance_id], "MOVE_HERO", { "hero_instance_id": hero_instance_id, "destination": destination }))

func select_formation_hero(hero_instance_id: String) -> void:
	if not _has_hero_instance(hero_instance_id):
		return
	if formation_controller.selected_hero_instance_id == hero_instance_id:
		formation_controller.clear_selection()
		_set_status("Formation selection cleared")
	else:
		formation_controller.select_hero(hero_instance_id, run_state.state)
		_set_status(localization.text("feedback.hero_selected"))
	_refresh_mobile_screen()

func request_selected_formation_move(destination: int) -> void:
	if not formation_controller.has_selection():
		_set_status(localization.text("feedback.select_hero"))
		return
	var hero_instance_id: String = formation_controller.selected_hero_instance_id
	if formation_controller.request_selected_move(destination, run_state.state):
		request_move_hero(hero_instance_id, destination)
		_set_status("Formation move requested")
	_refresh_mobile_screen()

func select_item(item_instance_id: String) -> void:
	var item_is_unequipped: bool = run_state.items.any(func(item): return String(item.get("instanceId", "")) == item_instance_id and not item.has("equippedHeroInstanceId"))
	if not item_is_unequipped:
		_set_status("That item is no longer available")
		return
	_selected_item_instance_id = "" if _selected_item_instance_id == item_instance_id else item_instance_id
	_item_feedback = "Select a hero to equip this item." if not _selected_item_instance_id.is_empty() else "Item selection cleared."
	_set_status(_item_feedback)
	_refresh_mobile_screen()

func _interact_with_hero(hero: Dictionary, destination: int) -> void:
	var hero_instance_id := String(hero.get("instanceId", ""))
	if hero_instance_id.is_empty():
		return
	if not _selected_item_instance_id.is_empty():
		request_equip_item(_selected_item_instance_id, hero_instance_id)
		_refresh_mobile_screen()
		return
	if formation_controller.has_selection():
		if formation_controller.selected_hero_instance_id == hero_instance_id:
			select_formation_hero(hero_instance_id)
			return
		request_selected_formation_move(destination)
		return
	select_formation_hero(hero_instance_id)

func request_drag_formation_move(hero_instance_id: String, destination: int) -> void:
	if formation_controller.request_drag_drop(hero_instance_id, destination, run_state.state):
		request_move_hero(hero_instance_id, destination)
		_set_status("Formation move requested")
		_refresh_mobile_screen()

func _interact_with_prepare_hero(hero_instance_id: String, destination: int) -> void:
	for hero in run_state.bench + run_state.board:
		if hero != null and String(hero.get("instanceId", "")) == hero_instance_id:
			_interact_with_hero(hero, destination)
			return

func _detect_star_upgrade(view: Dictionary) -> Dictionary:
	var previous: Dictionary = {}
	for hero in run_state.board + run_state.bench:
		if hero != null:
			previous[String(hero.get("instanceId", ""))] = hero
	for hero in Array(view.get("board", [])) + Array(view.get("bench", [])):
		if hero == null:
			continue
		var instance_id := String(hero.get("instanceId", ""))
		var prior: Dictionary = Dictionary(previous.get(instance_id, {}))
		if not prior.is_empty() and int(hero.get("stars", 1)) > int(prior.get("stars", 1)):
			var profile: Dictionary = HeroVisualCatalogScript.profile(String(hero.get("heroId", "")))
			audio_feedback.request_haptic("combine")
			return { "heroInstanceId": instance_id, "heroName": String(profile.get("display_name", hero.get("heroId", "Hero"))), "stars": int(hero.get("stars", 1)) }
	return {}

func request_return_to_bench(hero_instance_id: String, bench_slot: int = 0) -> void:
	request_move_hero(hero_instance_id, bench_slot)

func _has_hero_instance(hero_instance_id: String) -> bool:
	var exists_on_bench: bool = run_state.bench.any(func(hero): return String(hero.get("instanceId", "")) == hero_instance_id)
	var exists_on_board: bool = run_state.board.any(func(hero): return hero != null and String(hero.get("instanceId", "")) == hero_instance_id)
	return exists_on_bench or exists_on_board

func attach_run_api(client) -> void:
	if run_api_client != null and run_api_client != client and run_api_client.get_parent() == self:
		run_api_client.queue_free()
	run_api_client = client
	if run_api_client.get_parent() == null:
		add_child(run_api_client)
	if not run_api_client.run_view_received.is_connected(apply_run_view):
		run_api_client.run_view_received.connect(apply_run_view)
	if not run_api_client.request_failed.is_connected(_handle_run_request_failed):
		run_api_client.request_failed.connect(_handle_run_request_failed)
	if not run_api_client.combat_events_received.is_connected(load_authoritative_events):
		run_api_client.combat_events_received.connect(load_authoritative_events)
	if not command_requested.is_connected(_submit_run_command):
		command_requested.connect(_submit_run_command)

func _submit_run_command(payload: Dictionary) -> void:
	if _request_in_flight:
		_set_status("Request already in progress")
		return
	if run_api_client == null or run_state.run_id.is_empty():
		_set_status("Run is not connected")
		return
	_request_in_flight = true
	_set_status("Applying authoritative command...")
	_show_request_loading("Applying authoritative command...", _submit_run_command.bind(payload))
	run_api_client.submit_command(run_state.run_id, payload)

func _handle_run_request_failed(message: String) -> void:
	_request_in_flight = false
	_set_status("%s. Try again." % message)
	if feedback_overlay != null:
		feedback_overlay.show_error(message, _retry_request)
	_refresh_mobile_screen()

func load_authoritative_events(raw_events: Array) -> void:
	_clear_unit_views()
	_unknown_event_types.clear()
	var events: Array = []
	for raw_event in raw_events:
		if raw_event is Dictionary:
			events.append(CombatEventScript.from_dictionary(raw_event))
	if events.is_empty():
		_set_status("Combat event stream unavailable")
		_scheduler = null
		return
	_scheduler = ReplaySchedulerScript.new(events)
	_set_status("Replaying resolved combat")
	_apply_due_events(_scheduler.advance(0.0))

func _spawn_unit(event) -> void:
	var unit_id: String = String(event.source_unit_id)
	if unit_id.is_empty() or unit_views.has(unit_id):
		return
	var side := String(event.payload.get("side", "player"))
	var unit
	if side == "enemy":
		unit = MonsterViewScript.new()
		var monster_id := _monster_id_from_unit_id(unit_id)
		unit.configure(
			monster_id,
			int(event.payload.get("max_hp", 100000)),
			int(event.payload.get("position", 0)),
		)
		_show_biome_layer(_biome_for_monster(monster_id))
	else:
		unit = UnitViewScript.new()
		var hero_id := _hero_id_from_unit_id(unit_id)
		unit.configure(
			side,
			int(event.payload.get("position", 0)),
			int(event.payload.get("max_hp", 100000)),
			AssetManifestScript.hero_profile(hero_id),
			_unique_item_id_from_unit_id(unit_id),
		)
	unit.set_reduced_motion(bool(settings.get("reduced_motion", false)))
	if unit.has_method("set_sound_enabled"):
		unit.set_sound_enabled(bool(settings.get("sound", true)))
	unit_views[unit_id] = unit
	add_child(unit)
	unit.visible = screen_router == null or screen_router.current_screen_id == "combat"
	if side == "enemy" and _is_boss_unit(unit):
		_emphasize_camera(unit)
	_ensure_manifest_hud_item_icon()

func _move_unit(event) -> void:
	var unit = _targeted_unit(event)
	if unit != null and event.payload.has("to"):
		unit.move_to(int(event.payload["to"]))

func _present_source(event, animation_state: String) -> void:
	var unit = unit_views.get(String(event.source_unit_id))
	if unit != null:
		unit.present(animation_state)

func _present_target(event, animation_state: String) -> void:
	var unit = _targeted_unit(event)
	if unit != null:
		unit.present(animation_state)

func _present_target_with_status(event, next_status: String, animation_state: String) -> void:
	var unit = _targeted_unit(event)
	if unit != null:
		unit.set_status(next_status)
		unit.present(animation_state)

func _update_unit_hp(event, animation_state: String) -> void:
	var unit = _targeted_unit(event)
	if unit != null and event.payload.has("remaining_hp"):
		unit.set_hp(int(event.payload["remaining_hp"]))
		if unit.hp > 0:
			unit.present(animation_state)

func _update_unit_mana(event) -> void:
	var unit = _targeted_unit(event)
	if unit != null and event.payload.has("mana"):
		var max_mana := int(event.payload.get("max_mana", event.payload.get("maxMana", unit.max_mana)))
		unit.set_mana(int(event.payload["mana"]), max_mana)

func _mark_unit_defeated(event) -> void:
	var unit = _targeted_unit(event)
	if unit != null:
		unit.set_hp(0)
		audio_feedback.play_cue(self, "defeat")
		audio_feedback.request_haptic("defeat")

func _targeted_unit(event):
	var unit_id: String = String(event.target_unit_id if not event.target_unit_id.is_empty() else event.source_unit_id)
	return unit_views.get(unit_id)

func _source_unit(event):
	return unit_views.get(String(event.source_unit_id))

func _is_boss_unit(unit) -> bool:
	return str(unit.get("monster_id")).contains("boss") or str(unit.get("tier")) in ["boss", "boss_family"]

func _ensure_combat_presentation() -> void:
	if combat_vfx_pool == null:
		combat_vfx_pool = CombatVfxPoolScript.new()
		combat_vfx_pool.name = "CombatVfxPool"
		combat_vfx_pool.unit_position_resolver = func(unit_id: String) -> Vector2:
			var unit = unit_views.get(unit_id)
			return unit.position if unit != null else BOARD_RECT.get_center()
		combat_vfx_pool.set_reduced_motion(bool(settings.get("reduced_motion", false)))
		add_child(combat_vfx_pool)
	if combat_camera == null:
		combat_camera = Camera2D.new()
		combat_camera.name = "CombatCamera"
		combat_camera.position = BOARD_RECT.get_center()
		combat_camera.enabled = true
		add_child(combat_camera)
		camera_focus_position = combat_camera.position

func _emphasize_camera(unit) -> void:
	if unit == null:
		return
	_ensure_combat_presentation()
	camera_focus_position = unit.position
	combat_camera.position = camera_focus_position
	combat_camera.zoom = Vector2(1.08, 1.08)
	if bool(settings.get("reduced_motion", false)):
		return
	var reset := create_tween()
	reset.tween_property(combat_camera, "zoom", Vector2.ONE, 0.22)

func _hero_id_from_unit_id(unit_id: String) -> String:
	var instance_id := unit_id.trim_prefix("player:")
	for hero in run_state.bench:
		if String(hero.get("instanceId", "")) == instance_id:
			return String(hero.get("heroId", ""))
	for hero in run_state.board:
		if hero != null and String(hero.get("instanceId", "")) == instance_id:
			return String(hero.get("heroId", ""))
	var parts := unit_id.split(":")
	return parts[1] if parts.size() >= 2 else ""

func _monster_id_from_unit_id(unit_id: String) -> String:
	# Server combat snapshots identify enemies as enemy:PVE_XX:index. This is
	# presentation-only routing; combat rules and board coordinates stay server-owned.
	var parts := unit_id.split(":")
	if parts.size() >= 3 and parts[0] == "enemy":
		var encounter_id := String(parts[1])
		var encounter_monsters := {
			"PVE_01": "meadow",
			"PVE_02": "meadow",
			"PVE_03": "ruins_elite",
			"PVE_04": "ruins_boss",
			"PVE_05": "frost_keep",
			"PVE_06": "frost_keep_elite",
			"PVE_07": "ember_citadel_elite",
			"PVE_08": "ember_citadel_boss"
		}
		if encounter_monsters.has(encounter_id):
			return String(encounter_monsters[encounter_id])
	# Retain the local replay-fixture mapping for old Hxx enemy records.
	var hero_id := _hero_id_from_unit_id(unit_id)
	var fixture_biomes := {
		"H15": "meadow",
		"H16": "ruins",
		"H19": "frost_keep",
		"H17": "ember_citadel"
	}
	return String(fixture_biomes.get(hero_id, "meadow"))

func _biome_for_monster(monster_id: String) -> String:
	if monster_id.begins_with("ruins"):
		return "ruins"
	if monster_id.begins_with("frost_keep"):
		return "frost_keep"
	if monster_id.begins_with("ember_citadel"):
		return "ember_citadel"
	return "meadow"

func _show_biome_layer(biome_id: String) -> void:
	var texture := AssetManifestScript.resolve_biome_texture(biome_id)
	if texture == null:
		return
	var layer := get_node_or_null("BiomeLayer") as Sprite2D
	if layer == null:
		layer = Sprite2D.new()
		layer.name = "BiomeLayer"
		layer.position = BOARD_RECT.get_center()
		layer.z_index = -1
		add_child(layer)
	layer.texture = texture
	layer.scale = Vector2(BOARD_RECT.size.x / texture.get_size().x, BOARD_RECT.size.y / texture.get_size().y)

func board_tile_fill_color() -> Color:
	return Color(0.10, 0.15, 0.23, 0.42)

func board_base_color() -> Color:
	return Color(0.03, 0.05, 0.10, 0.16)

func _ensure_manifest_hud_item_icon() -> void:
	var icon := get_node_or_null("ManifestHudItemIcon") as Sprite2D
	var item_id := _authoritative_hud_item_id()
	if item_id.is_empty():
		if icon != null:
			icon.queue_free()
		return
	var texture := AssetManifestScript.resolve_item_texture(item_id)
	if texture == null:
		return
	if icon == null:
		icon = Sprite2D.new()
		icon.name = "ManifestHudItemIcon"
		icon.position = Vector2(74.0, 105.0)
		icon.scale = Vector2(0.16, 0.16)
		icon.z_index = 12
		add_child(icon)
	icon.texture = texture

func _authoritative_hud_item_id() -> String:
	for item in run_state.items:
		if not String(item.get("equippedHeroInstanceId", "")).is_empty():
			return String(item.get("itemId", ""))
	for item in run_state.items:
		var item_id := String(item.get("itemId", ""))
		if not item_id.is_empty():
			return item_id
	return ""

func _unique_item_id_from_unit_id(unit_id: String) -> String:
	var instance_id := unit_id.trim_prefix("player:")
	for item in run_state.items:
		if String(item.get("equippedHeroInstanceId", "")) == instance_id and String(item.get("kind", "")) == "unique":
			return String(item.get("itemId", ""))
	return ""

func _apply_due_events(events: Array) -> void:
	for event in events:
		apply_event(event)

func _clear_unit_views() -> void:
	for unit in unit_views.values():
		unit.queue_free()
	unit_views.clear()

func _set_status(next_status: String) -> void:
	status_text = next_status
	if status_label != null:
		status_label.text = status_text
	if mobile_status_label != null:
		mobile_status_label.text = status_text
	queue_redraw()

func _create_mobile_ui() -> void:
	_ensure_combat_presentation()
	if screen_router != null:
		return
	settings = settings_store.load_settings()
	localization.set_locale(String(settings.get("language", "en")))
	audio_feedback.configure(settings)
	screen_router = ScreenRouterScript.new()
	add_child(screen_router)
	feedback_overlay = FeedbackOverlayScript.new()
	screen_router.add_child(feedback_overlay)
	screen_router.lobby_screen.start_pve_requested.connect(func() -> void: show_mobile_screen("map"))
	screen_router.lobby_screen.continue_requested.connect(func() -> void:
		var cached_view := local_run_store.load_run()
		request_resume_run(String(cached_view.get("id", "")))
	)
	screen_router.lobby_screen.collection_requested.connect(func() -> void: show_mobile_screen("collection"))
	screen_router.lobby_screen.settings_requested.connect(func() -> void: show_mobile_screen("settings"))
	screen_router.encounter_map_screen.encounter_selected.connect(_select_encounter)
	screen_router.encounter_map_screen.back_requested.connect(func() -> void: show_mobile_screen("lobby"))
	screen_router.settings_screen.settings_changed.connect(_apply_screen_settings)
	screen_router.settings_screen.language_requested.connect(_toggle_language)
	screen_router.settings_screen.text_scale_requested.connect(_toggle_text_scale)
	screen_router.settings_screen.clear_saved_run_requested.connect(_clear_saved_run_from_settings)
	screen_router.settings_screen.back_requested.connect(func() -> void: show_mobile_screen("lobby"))
	screen_router.reward_screen.select_reward.connect(request_select_reward)
	screen_router.reward_screen.claim_empty_reward.connect(request_claim_empty_round_reward)
	screen_router.reward_screen.ack_unique.connect(request_ack_unique_reveal)
	screen_router.collection_screen.back_requested.connect(func() -> void: show_mobile_screen("lobby"))
	show_mobile_screen("lobby")

func set_reduced_motion(enabled: bool) -> void:
	settings["reduced_motion"] = enabled
	for unit in unit_views.values():
		unit.set_reduced_motion(enabled)
	_ensure_combat_presentation()
	combat_vfx_pool.set_reduced_motion(enabled)
	settings_store.save_settings(settings)

func show_mobile_screen(screen_id: String) -> void:
	if screen_router == null or not screen_router.show_screen(screen_id):
		return
	_set_combat_world_visible(screen_id == "combat")
	match screen_id:
		"lobby":
			screen_router.lobby_screen.set_continue_available(not local_run_store.load_run().is_empty())
		"map":
			screen_router.encounter_map_screen.set_encounters([], run_state.round if not run_state.run_id.is_empty() else 1)
		"settings":
			screen_router.settings_screen.set_locale(localization.locale)
			screen_router.settings_screen.set_settings(settings)
		"reward":
			screen_router.reward_screen.bind_reward(run_state.round_reward_plan, run_state.items, bool(settings.get("reduced_motion", false)))
		"collection":
			screen_router.collection_screen.bind_collection()
		_:
			_build_mobile_screen(screen_id)

func _set_combat_world_visible(visible: bool) -> void:
	# Prepare owns its own tactical preview. Replay actors must not bleed through
	# translucent staging surfaces when the player is arranging a formation.
	for unit in unit_views.values():
		if is_instance_valid(unit):
			unit.visible = visible
	for node_name in ["BiomeLayer", "ManifestHudItemIcon"]:
		var node := get_node_or_null(node_name) as CanvasItem
		if node != null:
			node.visible = visible
	if combat_vfx_pool != null:
		combat_vfx_pool.visible = visible
	if combat_camera != null:
		combat_camera.enabled = visible

func _select_encounter(_round: int) -> void:
	if run_state.run_id.is_empty():
		request_new_run()
	else:
		show_mobile_screen("prepare")

func _apply_screen_settings(updated_settings: Dictionary) -> void:
	settings = updated_settings.duplicate(true)
	for unit in unit_views.values():
		unit.set_reduced_motion(bool(settings.get("reduced_motion", false)))
		if unit.has_method("set_sound_enabled"):
			unit.set_sound_enabled(bool(settings.get("sound", true)))
	_ensure_combat_presentation()
	combat_vfx_pool.set_reduced_motion(bool(settings.get("reduced_motion", false)))
	audio_feedback.configure(settings)

func _toggle_text_scale() -> void:
	settings["text_scale"] = 1.15 if float(settings.get("text_scale", 1.0)) <= 1.0 else 1.0
	settings_store.save_settings(settings)
	show_mobile_screen("settings")

func _clear_saved_run_from_settings() -> void:
	local_run_store.clear_run()
	_set_status("Saved run cleared")
	show_mobile_screen("lobby")

func _refresh_mobile_screen() -> void:
	if screen_router == null:
		return
	var next_screen: String = String(screen_router.current_screen_id)
	if run_state.run_id.is_empty():
		next_screen = "lobby" if next_screen.is_empty() else next_screen
	elif run_state.state == "PREPARE":
		next_screen = "prepare"
	elif run_state.state == "COMBAT":
		next_screen = "combat"
	elif run_state.state == "REWARD":
		next_screen = "combat" if _pending_reward_review else "reward"
	elif run_state.state == "COMPLETE":
		next_screen = "recap"
	show_mobile_screen(next_screen)

func _show_request_loading(message: String, retry_request: Callable) -> void:
	_retry_request = retry_request
	if feedback_overlay == null:
		_create_mobile_ui()
	if feedback_overlay != null:
		feedback_overlay.show_loading(message)

func _clear_request_feedback() -> void:
	_retry_request = Callable()
	if feedback_overlay != null:
		feedback_overlay.clear_feedback()

func _build_mobile_screen(screen_id: String) -> void:
	var root: Control = screen_router.screen_root(screen_id)
	if root == null:
		return
	for child in root.get_children():
		child.queue_free()
	if screen_id == "prepare":
		_build_prepare_screen(root)
		return
	if screen_id != "combat":
		var background := ColorRect.new()
		background.color = ThemeTokensScript.NAVY
		background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		background.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(background)
	else:
		var combat_backdrop := ColorRect.new()
		combat_backdrop.name = "CombatBackdrop"
		combat_backdrop.color = Color("#0b13268c")
		combat_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		combat_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
		root.add_child(combat_backdrop)
	var title := Label.new()
	title.position = Vector2(40.0, 38.0)
	title.size = Vector2(1000.0, 58.0)
	title.add_theme_font_size_override("font_size", ThemeTokensScript.font_size("title"))
	title.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	title.text = _screen_title(screen_id)
	root.add_child(title)
	var status := Label.new()
	status.position = Vector2(40.0, 98.0)
	status.size = Vector2(1000.0, 38.0)
	status.add_theme_font_size_override("font_size", ThemeTokensScript.font_size("meta"))
	status.add_theme_color_override("font_color", ThemeTokensScript.MUTED)
	status.text = status_text
	root.add_child(status)
	mobile_status_label = status
	match screen_id:
		"prepare": _build_prepare_screen(root)
		"combat": _build_combat_screen(root)
		"reward": _build_reward_screen(root)
		"recap": _build_recap_screen(root)
		"collection": _build_collection_screen(root)

func _screen_title(screen_id: String) -> String:
	return localization.text("screen.%s" % screen_id)

func _screen_panel(root: Control, rect: Rect2, heading: String) -> VBoxContainer:
	var panel := PanelContainer.new()
	var safe_rect := ThemeTokensScript.clamp_to_content_bounds(rect)
	panel.position = safe_rect.position
	panel.size = safe_rect.size
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	root.add_child(panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(content)
	var label := Label.new()
	label.text = heading
	label.add_theme_font_size_override("font_size", ThemeTokensScript.font_size("section"))
	label.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	content.add_child(label)
	return content

func _mobile_button(text: String, action: Callable, accent: Color = ThemeTokensScript.GOLD) -> Button:
	var button := Button.new()
	button.text = text
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	button.pressed.connect(action)
	return button

func _build_lobby_screen(root: Control) -> void:
	var hero := _screen_panel(root, Rect2(40.0, 180.0, 1000.0, 570.0), "A small world, one brave eight-round climb")
	var description := Label.new()
	description.text = "Build a party of original chibi champions. Every battle is replayed from an authoritative deterministic result."
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	description.add_theme_font_size_override("font_size", 24)
	description.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	hero.add_child(description)
	hero.add_child(_mobile_button("Start PvE Expedition", func() -> void: show_mobile_screen("map"), ThemeTokensScript.GOLD))
	var cached_view := local_run_store.load_run()
	var continue_button := _mobile_button("Continue Saved Run", func() -> void:
		request_resume_run(String(cached_view.get("id", "")))
	, ThemeTokensScript.PLAYER)
	continue_button.disabled = cached_view.is_empty()
	hero.add_child(continue_button)
	var navigation := _screen_panel(root, Rect2(40.0, 790.0, 1000.0, 250.0), "Explore")
	navigation.add_child(_mobile_button("Collection", func() -> void: show_mobile_screen("collection"), ThemeTokensScript.STONE_RAISED))
	navigation.add_child(_mobile_button("Comfort & Accessibility", func() -> void: show_mobile_screen("settings"), ThemeTokensScript.STONE_RAISED))

func _build_map_screen(root: Control) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 170.0, 1000.0, 1120.0), "Eight encounters")
	var routes := GridContainer.new()
	routes.columns = 2
	routes.add_theme_constant_override("h_separation", 12)
	routes.add_theme_constant_override("v_separation", 12)
	panel.add_child(routes)
	var encounters := ["Meadow Skirmish", "Meadow Crossroads", "Ruins Ambush", "Ruins Miniboss", "Frost Keep Affix", "Frost Keep Siege", "Ember March", "Ember Citadel Boss"]
	for index in encounters.size():
		var is_next_round: bool = run_state.run_id.is_empty() or run_state.round == index + 1
		var node := _mobile_button("%d  %s" % [index + 1, encounters[index]], func() -> void:
			if run_state.run_id.is_empty():
				request_new_run()
			else:
				show_mobile_screen("prepare")
		, ThemeTokensScript.GOLD if is_next_round else ThemeTokensScript.STONE_RAISED)
		node.disabled = not is_next_round
		routes.add_child(node)
	panel.add_child(_mobile_button("Back to Lobby", func() -> void: show_mobile_screen("lobby"), ThemeTokensScript.STONE_RAISED))

func _build_prepare_screen(root: Control) -> void:
	if run_state.run_id.is_empty():
		_build_empty_run_state(root, "Start an expedition from the map to prepare a party.")
		return
	prepare_screen = PrepareScreenScript.new()
	root.add_child(prepare_screen)
	prepare_screen.buy_shop_slot.connect(request_buy_shop_slot)
	prepare_screen.refresh_shop.connect(request_refresh_shop)
	prepare_screen.lock_shop.connect(request_lock_shop)
	prepare_screen.buy_xp.connect(request_buy_xp)
	prepare_screen.start_round.connect(request_start_round)
	prepare_screen.sell_hero.connect(request_sell_hero)
	prepare_screen.formation_hero_pressed.connect(_interact_with_prepare_hero)
	prepare_screen.formation_destination_selected.connect(request_selected_formation_move)
	prepare_screen.formation_drag_dropped.connect(request_drag_formation_move)
	prepare_screen.item_selected.connect(select_item)
	prepare_screen.item_equip_requested.connect(request_equip_item)
	prepare_screen.unequip_item_requested.connect(request_unequip_item)
	prepare_screen.collection_requested.connect(func() -> void: show_mobile_screen("collection"))
	prepare_screen.bind_run(_prepare_screen_view())
	return

func _prepare_screen_view() -> Dictionary:
	var view := _public_run_view.duplicate(true)
	view["biome"] = _biome_for_round(run_state.round)
	view["selectedHeroInstanceId"] = formation_controller.selected_hero_instance_id
	view["selectedItemInstanceId"] = _selected_item_instance_id
	view["itemFeedback"] = _item_feedback
	view["starUpgrade"] = _star_upgrade
	view["reducedMotion"] = bool(settings.get("reduced_motion", false))
	return view

func _biome_for_round(round: int) -> String:
	if ADVENTURE_BIOMES.is_empty():
		return "meadow"
	var index := clampi(round - 1, 0, ADVENTURE_BIOMES.size() - 1)
	return String(ADVENTURE_BIOMES[index])

func _board_hero_count() -> int:
	return run_state.board.filter(func(hero): return hero != null).size()

func _place_first_bench_hero(board_index: int) -> void:
	if run_state.bench.is_empty():
		return
	request_move_bench_hero(String(run_state.bench.front().get("instanceId", "")), 16 + board_index)

func _place_hero_on_first_open_tile(hero_instance_id: String) -> void:
	var destination := _first_open_board_destination()
	if destination != -1:
		request_move_bench_hero(hero_instance_id, destination)

func _build_combat_screen(root: Control) -> void:
	var layout := combat_layout()
	var panel := _screen_panel(root, Rect2(layout.controls), "COMBAT COMMAND DECK")
	panel.get_parent().name = "CombatReplayControls"
	var detail := Label.new()
	detail.text = "SERVER RESOLVED  |  Playback controls never alter combat."
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_theme_font_size_override("font_size", 22)
	panel.add_child(detail)
	combat_hud = CombatHudScript.new()
	combat_hud.pause_requested.connect(toggle_pause)
	combat_hud.speed_requested.connect(set_playback_speed)
	panel.add_child(combat_hud)
	_bind_combat_hud()
	if _pending_reward_review:
		var reward_button := _mobile_button("Review round rewards", review_pending_round_reward, ThemeTokensScript.GOLD)
		reward_button.name = "ReviewRoundRewards"
		reward_button.tooltip_text = "Open the authoritative rewards after watching this combat replay."
		panel.add_child(reward_button)
	var notice := _screen_panel(root, Rect2(layout.message), "4 x 8 ARENA")
	notice.get_parent().name = "CombatBoardMessage"
	var label := Label.new()
	label.text = "Enemy ranks occupy the upper half. Your squad holds the lower half."
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 20)
	notice.add_child(label)
	var provenance := Label.new()
	provenance.text = "Health bars, VFX, positions, and outcome come from the authoritative event stream."
	provenance.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	provenance.add_theme_font_size_override("font_size", 20)
	provenance.add_theme_color_override("font_color", ThemeTokensScript.MUTED)
	notice.add_child(provenance)

func combat_layout() -> Dictionary:
	var margin := 24.0
	var controls := Rect2(margin, BOARD_RECT.end.y + margin, 1080.0 - margin * 2.0, 170.0)
	var message := Rect2(margin, controls.end.y + 16.0, 1080.0 - margin * 2.0, combat_notice_height())
	return { "controls": controls, "message": message }

func combat_notice_height() -> float:
	return float(ThemeTokensScript.font_size("section")) + COMBAT_NOTICE_BODY_FONT_SIZE * COMBAT_NOTICE_BODY_LINES + ThemeTokensScript.TOUCH_GAP * 3.0 + COMBAT_NOTICE_VERTICAL_PADDING

func _build_reward_screen(root: Control) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 165.0, 1000.0, 1420.0), "Choose every offer before claiming")
	for item in run_state.items:
		if String(item.get("kind", "")) == "unique" and not item.has("equippedHeroInstanceId"):
			panel.add_child(_mobile_button("Reveal Unique: %s" % String(item.get("itemId", "?")), request_ack_unique_reveal.bind(String(item.get("instanceId", ""))), ThemeTokensScript.GOLD))
	for offer in Array(run_state.round_reward_plan.get("offers", [])):
		var heading := Label.new()
		heading.text = String(offer.get("kind", "Reward"))
		heading.add_theme_font_size_override("font_size", 22)
		heading.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		panel.add_child(heading)
		for option in Array(offer.get("options", [])):
			var option_id := String(option.get("id", "?"))
			panel.add_child(_mobile_button("Choose %s" % option_id, request_select_reward.bind(String(offer.get("id", "")), option_id), ThemeTokensScript.PLAYER))
	if run_state.round_reward_plan.is_empty():
		var no_rewards := Label.new()
		no_rewards.text = "The server has not published a reward selection for this round."
		no_rewards.add_theme_color_override("font_color", ThemeTokensScript.MUTED)
		panel.add_child(no_rewards)

func _build_recap_screen(root: Control) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 185.0, 1000.0, 700.0), "The expedition is complete")
	var recap = RunRecapScreenScript.new()
	recap.bind_snapshot(_authoritative_recap_snapshot())
	panel.add_child(recap)
	panel.add_child(_mobile_button("Return to Lobby", func() -> void: show_mobile_screen("lobby"), ThemeTokensScript.GOLD))
	panel.add_child(_mobile_button("Replay Combat", restart_replay, ThemeTokensScript.STONE_RAISED))

func _bind_combat_hud() -> void:
	if combat_hud != null:
		combat_hud.bind_snapshot({ "paused": _paused, "playbackSpeed": _playback_speed })

func _authoritative_recap_snapshot() -> Dictionary:
	return run_state.recap.duplicate(true)

func _build_collection_screen(root: Control) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 165.0, 1000.0, 1550.0), "20 current heroes  •  no reward-only Unique heroes")
	var cards := GridContainer.new()
	cards.columns = 2
	cards.add_theme_constant_override("h_separation", ThemeTokensScript.TOUCH_GAP)
	cards.add_theme_constant_override("v_separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(cards)
	var filters := HBoxContainer.new()
	filters.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	filters.add_child(_collection_filter_picker("Species", ["all", "cat", "dog", "rabbit", "cow", "exotic"], _collection_species_filter, func(value: String) -> void:
		_collection_species_filter = value
		show_mobile_screen("collection")
	))
	filters.add_child(_collection_filter_picker("Role", ["all", "guardian", "fighter", "ranger", "mage", "support"], _collection_role_filter, func(value: String) -> void:
		_collection_role_filter = value
		show_mobile_screen("collection")
	))
	panel.add_child(filters)
	panel.move_child(filters, 1)
	for index in 20:
		var hero_id := "H%02d" % (index + 1)
		var profile: Dictionary = HeroVisualCatalogScript.profile(hero_id)
		if _collection_species_filter != "all" and String(profile.species) != _collection_species_filter:
			continue
		if _collection_role_filter != "all" and String(profile.role) != _collection_role_filter:
			continue
		cards.add_child(_mobile_button(hero_id + "  •  View profile", func() -> void: _set_status("%s profile selected" % hero_id), ThemeTokensScript.STONE_RAISED))
	panel.add_child(_mobile_button("Back", func() -> void: show_mobile_screen("lobby"), ThemeTokensScript.GOLD))

func collection_hero_ids() -> Array[String]:
	if screen_router != null and screen_router.collection_screen != null:
		return screen_router.collection_screen.visible_hero_ids()
	var ids: Array[String] = []
	for hero_id in HeroVisualCatalogScript.hero_ids():
		var profile: Dictionary = HeroVisualCatalogScript.profile(hero_id)
		if _collection_species_filter != "all" and String(profile.species) != _collection_species_filter:
			continue
		if _collection_role_filter != "all" and String(profile.role) != _collection_role_filter:
			continue
		ids.append(hero_id)
	return ids

func set_collection_filters(species: String, role: String) -> void:
	_collection_species_filter = species if species in ["all", "cat", "dog", "rabbit", "cow", "exotic"] else "all"
	_collection_role_filter = role if role in ["all", "guardian", "fighter", "ranger", "mage", "support"] else "all"
	if screen_router != null and screen_router.collection_screen != null:
		screen_router.collection_screen.set_filters(_collection_species_filter, _collection_role_filter)
	if screen_router != null and screen_router.current_screen_id == "collection":
		show_mobile_screen("collection")

func _collection_filter_picker(label: String, values: Array[String], selected_value: String, selected: Callable) -> OptionButton:
	var picker := OptionButton.new()
	picker.custom_minimum_size = Vector2(470.0, ThemeTokensScript.TOUCH_TARGET)
	picker.tooltip_text = label
	for value in values:
		picker.add_item(value.capitalize())
		if value == selected_value:
			picker.select(picker.item_count - 1)
	picker.item_selected.connect(func(index: int) -> void: selected.call(values[index]))
	return picker

func _build_settings_screen(root: Control) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 165.0, 1000.0, 820.0), "Comfort controls")
	for option in ["sound", "music", "haptics", "reduced_motion"]:
		var toggle := CheckButton.new()
		toggle.text = option.capitalize().replace("_", " ")
		toggle.button_pressed = bool(settings.get(option, false))
		toggle.custom_minimum_size.y = ThemeTokensScript.TOUCH_TARGET
		toggle.add_theme_font_size_override("font_size", 24)
		toggle.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		toggle.toggled.connect(func(value: bool) -> void:
			if option == "reduced_motion":
				set_reduced_motion(value)
			else:
				settings[option] = value
				settings_store.save_settings(settings)
			audio_feedback.configure(settings)
		)
		panel.add_child(toggle)
	panel.add_child(_mobile_button(localization.text("settings.language", { "language": localization.text("language.%s" % String(settings.get("language", "en"))) }), _toggle_language, ThemeTokensScript.PLAYER))
	panel.add_child(_mobile_button("Text scale: %d%%" % int(float(settings.get("text_scale", 1.0)) * 100.0), func() -> void:
		settings["text_scale"] = 1.15 if float(settings.get("text_scale", 1.0)) <= 1.0 else 1.0
		settings_store.save_settings(settings)
		show_mobile_screen("settings")
	, ThemeTokensScript.PLAYER))
	panel.add_child(_mobile_button("Clear saved run", func() -> void:
		local_run_store.clear_run()
		_set_status("Saved run cleared")
		show_mobile_screen("lobby")
	, ThemeTokensScript.DANGER))
	panel.add_child(_mobile_button("Back", func() -> void: show_mobile_screen("lobby"), ThemeTokensScript.GOLD))

func _toggle_language() -> void:
	settings["language"] = "vi" if String(settings.get("language", "en")) == "en" else "en"
	settings_store.save_settings(settings)
	localization.set_locale(String(settings.language))
	show_mobile_screen("settings")

func _build_empty_run_state(root: Control, message: String) -> void:
	var panel := _screen_panel(root, Rect2(40.0, 320.0, 1000.0, 300.0), "No active run")
	var label := Label.new()
	label.text = message
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", 24)
	label.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	panel.add_child(label)
	panel.add_child(_mobile_button("Open expedition map", func() -> void: show_mobile_screen("map"), ThemeTokensScript.GOLD))

func _button(label: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = label
	button.add_theme_font_size_override("font_size", 24)
	button.pressed.connect(action)
	return button

func mobile_controls_rect() -> Rect2:
	return MOBILE_CONTROLS_RECT

func _refresh_run_ui() -> void:
	if run_label == null:
		return
	if run_state.run_id.is_empty():
		run_label.text = "Run: not connected"
		shop_label.text = "Shop: —"
		bench_label.text = "Bench: —"
		item_label.text = "Items: —"
		refresh_shop_button.disabled = true
		start_round_button.disabled = true
		reward_label.text = "Rewards: unavailable"
		_refresh_action_buttons()
		_refresh_reward_buttons()
		return
	run_label.text = "Round %d · %s · %d gold · %d HP" % [run_state.round, run_state.state, run_state.gold, run_state.health]
	shop_label.text = "Shop: %s" % _slots_text(run_state.shop, "heroId")
	bench_label.text = "Bench: %s" % _slots_text(run_state.bench, "heroId")
	item_label.text = "Items: %s" % _slots_text(run_state.items, "itemId")
	if run_state.state == "REWARD":
		reward_label.text = "Rewards: choose one option per offer"
	elif run_state.reward_heroes.is_empty():
		reward_label.text = "Rewards: none pending"
	else:
		reward_label.text = "Reward heroes: %s" % _slots_text(run_state.reward_heroes, "heroId")
	refresh_shop_button.disabled = run_state.state != "PREPARE" or (run_state.free_refreshes <= 0 and run_state.gold < 2)
	start_round_button.disabled = not run_state.can_start_round()
	_refresh_action_buttons()
	_refresh_item_buttons()
	_refresh_reward_buttons()
	_set_status("Run %s ready" % run_state.run_id if run_state.state == "PREPARE" else "Run %s: %s" % [run_state.run_id, run_state.state])

func _refresh_action_buttons() -> void:
	if shop_actions == null or bench_actions == null:
		return
	for child in shop_actions.get_children():
		child.queue_free()
	for child in bench_actions.get_children():
		child.queue_free()
	if run_state.run_id.is_empty():
		return
	for shop_slot_index in run_state.shop.size():
		var slot = run_state.shop[shop_slot_index]
		var buy_button := Button.new()
		if slot == null:
			buy_button.text = "Sold"
			buy_button.disabled = true
		else:
			buy_button.text = "Buy %s (%d)" % [String(slot.get("heroId", "?")), int(slot.get("cost", 0))]
			buy_button.disabled = run_state.state != "PREPARE" or run_state.gold < int(slot.get("cost", 0)) or run_state.bench.size() >= 8
			buy_button.pressed.connect(request_buy_shop_slot.bind(shop_slot_index))
		shop_actions.add_child(buy_button)
	var destination := _first_open_board_destination()
	for hero in run_state.bench:
		var place_button := Button.new()
		place_button.text = "Place %s" % String(hero.get("heroId", "?"))
		place_button.disabled = run_state.state != "PREPARE" or destination == -1
		if not place_button.disabled:
			place_button.pressed.connect(request_move_bench_hero.bind(String(hero.get("instanceId", "")), destination))
		bench_actions.add_child(place_button)
		var sell_button := Button.new()
		sell_button.text = "Sell %s" % String(hero.get("heroId", "?"))
		sell_button.disabled = run_state.state != "PREPARE"
		if not sell_button.disabled:
			sell_button.pressed.connect(request_sell_hero.bind(String(hero.get("instanceId", ""))))
		bench_actions.add_child(sell_button)

func _first_open_board_destination() -> int:
	for board_index in run_state.board.size():
		if run_state.board[board_index] == null:
			return 16 + board_index
	return -1

func _refresh_item_buttons() -> void:
	if item_actions == null:
		return
	for child in item_actions.get_children():
		child.queue_free()
	if run_state.run_id.is_empty():
		return
	var heroes: Array = run_state.bench.duplicate()
	for board_hero in run_state.board:
		if board_hero != null:
			heroes.append(board_hero)
	for item in run_state.items:
		var item_instance_id := String(item.get("instanceId", ""))
		var item_id := String(item.get("itemId", "?"))
		if item.has("equippedHeroInstanceId"):
			var unequip_button := Button.new()
			unequip_button.text = "Unequip %s" % item_id
			unequip_button.disabled = run_state.state != "PREPARE"
			if not unequip_button.disabled:
				unequip_button.pressed.connect(request_unequip_item.bind(item_instance_id))
			item_actions.add_child(unequip_button)
			continue
		for hero in heroes:
			var equip_button := Button.new()
			equip_button.text = "Equip %s → %s" % [item_id, String(hero.get("heroId", "?"))]
			equip_button.disabled = run_state.state != "PREPARE"
			if not equip_button.disabled:
				equip_button.pressed.connect(request_equip_item.bind(item_instance_id, String(hero.get("instanceId", ""))))
			item_actions.add_child(equip_button)

func _refresh_reward_buttons() -> void:
	if reward_actions == null:
		return
	for child in reward_actions.get_children():
		child.queue_free()
	if run_state.state == "PREPARE":
		for hero in run_state.reward_heroes:
			var hero_instance_id := String(hero.get("instanceId", ""))
			var claim_button := Button.new()
			claim_button.text = "Claim reward %s" % String(hero.get("heroId", "?"))
			claim_button.disabled = run_state.bench.size() >= 8
			if not claim_button.disabled:
				claim_button.pressed.connect(request_claim_reward_hero.bind(hero_instance_id))
			reward_actions.add_child(claim_button)
		return
	if run_state.state != "REWARD":
		return
	for item in run_state.items:
		var reveal_id := String(item.get("instanceId", ""))
		if String(item.get("kind", "")) != "unique" or item.has("equippedHeroInstanceId"):
			continue
		var reveal_button := Button.new()
		reveal_button.text = "Unique revealed: %s" % String(item.get("itemId", "?"))
		reveal_button.disabled = _acknowledged_reveals.has(reveal_id)
		if not reveal_button.disabled:
			reveal_button.pressed.connect(request_ack_unique_reveal.bind(reveal_id))
		reward_actions.add_child(reveal_button)
	for offer in Array(run_state.round_reward_plan.get("offers", [])):
		var offer_id := String(offer.get("id", ""))
		for option in Array(offer.get("options", [])):
			var option_id := String(option.get("id", "?"))
			var select_button := Button.new()
			var selected := String(_reward_selections.get(offer_id, "")) == option_id
			select_button.text = "%s: %s%s" % [String(offer.get("kind", "reward")), option_id, " selected" if selected else ""]
			select_button.pressed.connect(request_select_reward.bind(offer_id, option_id))
			reward_actions.add_child(select_button)

func _slots_text(slots: Array, key: String) -> String:
	if slots.is_empty():
		return "empty"
	var labels: Array[String] = []
	for slot in slots:
		labels.append("—" if slot == null else String(slot.get(key, "?")))
	return ", ".join(labels)

func _draw() -> void:
	draw_rect(BOARD_RECT, board_base_color(), true)
	for row in BOARD_ROWS:
		for column in BOARD_COLUMNS:
			var cell := Rect2(column * CELL_WIDTH, row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT)
			draw_rect(cell.grow(-6.0), board_tile_fill_color(), true)
			draw_rect(cell.grow(-6.0), Color("#334155"), false, 2.0)
	draw_string(ThemeDB.fallback_font, Vector2(24.0, 176.0), "AUTO BATTLER ALPHA  •  REPLAY BOARD", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color("#93c5fd"))
