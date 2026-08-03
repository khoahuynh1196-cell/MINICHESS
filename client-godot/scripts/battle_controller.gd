extends Node2D

const UnitViewScript = preload("res://scripts/unit_view.gd")
const ReplayLoaderScript = preload("res://scripts/replay_loader.gd")
const ReplaySchedulerScript = preload("res://scripts/replay_scheduler.gd")
const CombatEventScript = preload("res://scripts/combat_event.gd")
const RunStateScript = preload("res://scripts/run_state.gd")
const RunApiClientScript = preload("res://scripts/run_api_client.gd")
const BOARD_COLUMNS := 3
const BOARD_ROWS := 8
const CELL_WIDTH := 280.0
const CELL_HEIGHT := 190.0
const CONTENT_VERSION := "alpha-0.3.0"

var unit_views: Dictionary = {}
var status_text := "Waiting for replay"
var status_label: Label
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
var run_api_client
var _unknown_event_types: Dictionary = {}
var _scheduler
var _replay_path := "res://fixtures/combat-replay.json"
var _paused := false
var _playback_speed := 1.0
var _reward_selections: Dictionary = {}
var _acknowledged_reveals: Dictionary = {}

signal command_requested(payload: Dictionary)

func _ready() -> void:
	_create_controls()
	attach_run_api(RunApiClientScript.new())
	load_replay(_replay_path)
	queue_redraw()

func _process(delta: float) -> void:
	if not _paused:
		advance_replay(delta)

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
	_set_status("Replaying combat at %s×" % speed)

func toggle_pause() -> void:
	_paused = not _paused
	_set_status("Paused" if _paused else "Replaying combat")

func apply_event(event) -> void:
	match event.type:
		"UNIT_SPAWNED":
			_spawn_unit(event)
		"UNIT_MOVED", "UNIT_DISPLACED":
			_move_unit(event)
		"BASIC_ATTACK":
			_present_source(event, "basic_attack")
		"CAST_STARTED", "CAST_RESOLVED":
			_present_source(event, "skill")
		"DAMAGE_APPLIED":
			_update_unit_hp(event, "hit")
		"HEAL_APPLIED":
			_update_unit_hp(event, "skill")
		"EFFECT_APPLIED", "SHIELD_APPLIED", "STAT_MODIFIER_APPLIED", "CLEANSE_APPLIED":
			_present_target(event, "skill")
		"STUN_APPLIED", "SLOW_APPLIED":
			_present_target(event, "hit")
		"UNIT_DIED":
			_mark_unit_defeated(event)
		"COMBAT_ENDED":
			_set_status("Combat ended: %s" % String(event.payload.get("winner", "unknown")))
		_:
			if not _unknown_event_types.has(event.type):
				_unknown_event_types[event.type] = true
				print("Ignoring presentation-unsupported event: %s" % event.type)

func apply_run_view(view: Dictionary) -> void:
	run_state.apply_server_view(view)
	if run_state.state != "REWARD":
		_reward_selections.clear()
		_acknowledged_reveals.clear()
	if start_round_button == null:
		_create_controls()
	_refresh_run_ui()

func build_command_payload(command_id: String, command_type: String, fields: Dictionary = {}) -> Dictionary:
	return run_state.command_payload(command_id, command_type, fields)

func request_start_round() -> void:
	if not run_state.can_start_round():
		return
	command_requested.emit(build_command_payload("client-start-%s" % run_state.revision, "START_ROUND"))

func request_new_run(requested_run_id: String = "") -> void:
	if run_api_client == null:
		_set_status("Run API is not connected")
		return
	var run_id := requested_run_id if not requested_run_id.is_empty() else "run-%s" % Time.get_ticks_msec()
	run_api_client.create_run(run_id, CONTENT_VERSION)

func request_resume_run(requested_run_id: String = "") -> void:
	if run_api_client == null:
		_set_status("Run API is not connected")
		return
	var run_id := requested_run_id if not requested_run_id.is_empty() else resume_run_input.text.strip_edges()
	if run_id.is_empty():
		_set_status("Enter a run ID to resume")
		return
	run_api_client.resume_run(run_id)

func request_buy_shop_slot(shop_slot_index: int) -> void:
	if run_state.state != "PREPARE" or shop_slot_index < 0 or shop_slot_index >= run_state.shop.size():
		return
	var slot = run_state.shop[shop_slot_index]
	if slot == null or run_state.gold < int(slot.get("cost", 0)) or run_state.bench.size() >= 8:
		return
	command_requested.emit(build_command_payload("client-buy-%s-%s" % [run_state.revision, shop_slot_index], "BUY_SHOP_HERO", { "shop_slot_index": shop_slot_index }))

func request_refresh_shop() -> void:
	if run_state.state != "PREPARE" or (run_state.free_refreshes <= 0 and run_state.gold < 2):
		return
	command_requested.emit(build_command_payload("client-refresh-%s" % run_state.revision, "REFRESH_SHOP"))

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
	var item_is_unequipped: bool = run_state.items.any(func(item): return String(item.get("instanceId", "")) == item_instance_id and not item.has("equippedHeroInstanceId"))
	if not item_is_unequipped:
		return
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
	if run_state.state != "PREPARE" or destination < 12 or destination > 23:
		return
	if not run_state.bench.any(func(hero): return String(hero.get("instanceId", "")) == hero_instance_id):
		return
	command_requested.emit(build_command_payload("client-move-%s-%s" % [run_state.revision, hero_instance_id], "MOVE_HERO", { "hero_instance_id": hero_instance_id, "destination": destination }))

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
	if not run_api_client.request_failed.is_connected(_set_status):
		run_api_client.request_failed.connect(_set_status)
	if not run_api_client.combat_events_received.is_connected(load_authoritative_events):
		run_api_client.combat_events_received.connect(load_authoritative_events)
	if not command_requested.is_connected(_submit_run_command):
		command_requested.connect(_submit_run_command)

func _submit_run_command(payload: Dictionary) -> void:
	if run_api_client == null or run_state.run_id.is_empty():
		_set_status("Run is not connected")
		return
	run_api_client.submit_command(run_state.run_id, payload)

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
	var unit = UnitViewScript.new()
	unit.configure(
		String(event.payload.get("side", "player")),
		int(event.payload.get("position", 0)),
		int(event.payload.get("max_hp", 100000)),
		_hero_id_from_unit_id(unit_id),
		_unique_item_id_from_unit_id(unit_id),
	)
	unit_views[unit_id] = unit
	add_child(unit)

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

func _update_unit_hp(event, animation_state: String) -> void:
	var unit = _targeted_unit(event)
	if unit != null and event.payload.has("remaining_hp"):
		unit.set_hp(int(event.payload["remaining_hp"]))
		if unit.hp > 0:
			unit.present(animation_state)

func _mark_unit_defeated(event) -> void:
	var unit = _targeted_unit(event)
	if unit != null:
		unit.set_hp(0)

func _targeted_unit(event):
	var unit_id: String = String(event.target_unit_id if not event.target_unit_id.is_empty() else event.source_unit_id)
	return unit_views.get(unit_id)

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
	queue_redraw()

func _create_controls() -> void:
	var layer := CanvasLayer.new()
	var controls := VBoxContainer.new()
	controls.position = Vector2(16.0, 1060.0)
	controls.size = Vector2(1048.0, 820.0)
	layer.add_child(controls)

	status_label = Label.new()
	status_label.text = status_text
	controls.add_child(status_label)
	run_label = Label.new()
	controls.add_child(run_label)
	shop_label = Label.new()
	shop_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(shop_label)
	shop_actions = HBoxContainer.new()
	controls.add_child(shop_actions)
	refresh_shop_button = _button("Refresh Shop", request_refresh_shop)
	controls.add_child(refresh_shop_button)
	bench_label = Label.new()
	bench_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(bench_label)
	bench_actions = HBoxContainer.new()
	controls.add_child(bench_actions)
	item_label = Label.new()
	item_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(item_label)
	item_actions = HBoxContainer.new()
	controls.add_child(item_actions)
	reward_label = Label.new()
	reward_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	controls.add_child(reward_label)
	reward_actions = VBoxContainer.new()
	controls.add_child(reward_actions)
	new_run_button = _button("New Run", request_new_run)
	controls.add_child(new_run_button)
	resume_run_input = LineEdit.new()
	resume_run_input.placeholder_text = "Run ID to resume"
	controls.add_child(resume_run_input)
	resume_run_button = _button("Resume Run", request_resume_run)
	controls.add_child(resume_run_button)
	start_round_button = _button("Start Round", request_start_round)
	start_round_button.disabled = true
	controls.add_child(start_round_button)
	controls.add_child(_button("Play", func() -> void: _paused = false))
	controls.add_child(_button("Pause", func() -> void: _paused = true))
	controls.add_child(_button("Restart", restart_replay))
	controls.add_child(_button("1×", func() -> void: set_playback_speed(1.0)))
	controls.add_child(_button("2×", func() -> void: set_playback_speed(2.0)))
	add_child(layer)
	_refresh_run_ui()

func _button(label: String, action: Callable) -> Button:
	var button := Button.new()
	button.text = label
	button.pressed.connect(action)
	return button

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
			return 12 + board_index
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
	draw_rect(Rect2(Vector2.ZERO, Vector2(CELL_WIDTH * BOARD_COLUMNS, CELL_HEIGHT * BOARD_ROWS)), Color("#111827"), true)
	for row in BOARD_ROWS:
		for column in BOARD_COLUMNS:
			var cell := Rect2(column * CELL_WIDTH, row * CELL_HEIGHT, CELL_WIDTH, CELL_HEIGHT)
			draw_rect(cell.grow(-6.0), Color("#1f2937"), true)
			draw_rect(cell.grow(-6.0), Color("#334155"), false, 2.0)
	draw_string(ThemeDB.fallback_font, Vector2(24.0, 42.0), status_text, HORIZONTAL_ALIGNMENT_LEFT, -1, 24, Color.WHITE)
