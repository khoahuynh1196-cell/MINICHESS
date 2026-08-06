class_name AdventureController
extends Node

const CommandFactoryScript = preload("res://scripts/adventure/adventure_command_factory.gd")

signal view_changed(view: Dictionary)
signal phase_changed(previous_phase: String, next_phase: String)
signal command_rejected(action: String, reason: String)
signal protocol_error(message: String)

var _runtime_port
var _view: Dictionary = {}
var _command_id_provider: Callable = Callable()

func attach_runtime_port(runtime_port) -> void:
	if _runtime_port != null:
		_disconnect_runtime_port(_runtime_port)
	_runtime_port = runtime_port
	if _runtime_port == null:
		return
	_runtime_port.view_changed.connect(_on_runtime_view_changed)
	_runtime_port.protocol_error.connect(_on_runtime_protocol_error)
	if _runtime_port.has_view():
		_on_runtime_view_changed(_runtime_port.current_view())

func current_view() -> Dictionary:
	return _view.duplicate(true)

func has_view() -> bool:
	return not _view.is_empty()

func set_command_id_provider_for_test(provider: Callable) -> void:
	_command_id_provider = provider

func request_refresh_shop() -> bool:
	return _submit_action("refreshShop", "REFRESH_SHOP", func(command_id: String, revision: int):
		return CommandFactoryScript.refresh_shop(command_id, revision))

func request_lock_shop() -> bool:
	return _submit_action("lockShop", "LOCK_SHOP", func(command_id: String, revision: int):
		return CommandFactoryScript.lock_shop(command_id, revision))

func request_buy_xp() -> bool:
	return _submit_action("buyXp", "BUY_XP", func(command_id: String, revision: int):
		return CommandFactoryScript.buy_xp(command_id, revision))

func request_buy_shop_hero(shop_slot_index: int) -> bool:
	var slot_action := _shop_slot_action(shop_slot_index)
	if not bool(slot_action.get("allowed", false)):
		return _reject("buyShopSlot", String(slot_action.get("reason", "ACTION_NOT_ALLOWED")))
	return _submit(CommandFactoryScript.buy_shop_hero(
		_next_command_id("BUY_SHOP_HERO"),
		_current_revision(),
		shop_slot_index,
	))

func request_move_hero(hero_instance_id: String, destination_kind: String, destination_index: int) -> bool:
	if not _prepare_phase():
		return _reject("moveHero", "WRONG_PHASE")
	return _submit(CommandFactoryScript.move_hero(
		_next_command_id("MOVE_HERO"),
		_current_revision(),
		hero_instance_id,
		destination_kind,
		destination_index,
	))

func request_sell_hero(hero_instance_id: String) -> bool:
	if not _prepare_phase():
		return _reject("sellHero", "WRONG_PHASE")
	return _submit(CommandFactoryScript.sell_hero(
		_next_command_id("SELL_HERO"),
		_current_revision(),
		hero_instance_id,
	))

func request_equip_item(item_instance_id: String, hero_instance_id: String) -> bool:
	if not _prepare_phase():
		return _reject("equipItem", "WRONG_PHASE")
	return _submit(CommandFactoryScript.equip_item(
		_next_command_id("EQUIP_ITEM"),
		_current_revision(),
		item_instance_id,
		hero_instance_id,
	))

func request_unequip_item(item_instance_id: String) -> bool:
	if not _prepare_phase():
		return _reject("unequipItem", "WRONG_PHASE")
	return _submit(CommandFactoryScript.unequip_item(
		_next_command_id("UNEQUIP_ITEM"),
		_current_revision(),
		item_instance_id,
	))

func request_claim_reward_hero(hero_instance_id: String) -> bool:
	return _submit_action("claimRewardHero", "CLAIM_REWARD_HERO", func(command_id: String, revision: int):
		return CommandFactoryScript.claim_reward_hero(command_id, revision, hero_instance_id))

func request_start_round() -> bool:
	return _submit_action("startRound", "START_ROUND", func(command_id: String, revision: int):
		return CommandFactoryScript.start_round(command_id, revision))

func request_resolve_combat() -> bool:
	return _submit_action("resolveCombat", "RESOLVE_COMBAT", func(command_id: String, revision: int):
		return CommandFactoryScript.resolve_combat(command_id, revision))

func request_claim_round_reward(selections: Array) -> bool:
	return _submit_action("claimRoundReward", "CLAIM_ROUND_REWARD", func(command_id: String, revision: int):
		return CommandFactoryScript.claim_round_reward(command_id, revision, selections))

func _submit_action(action_name: String, command_type: String, payload_builder: Callable) -> bool:
	var action := _action(action_name)
	if not bool(action.get("allowed", false)):
		return _reject(action_name, String(action.get("reason", "ACTION_NOT_ALLOWED")))
	return _submit(payload_builder.call(_next_command_id(command_type), _current_revision()))

func _submit(request: Dictionary) -> bool:
	if _runtime_port == null:
		return _reject(String(request.get("type", "unknown")), "RUNTIME_NOT_ATTACHED")
	return _runtime_port.submit(request)

func _action(action_name: String) -> Dictionary:
	if not has_view():
		return { "allowed": false, "reason": "VIEW_NOT_READY" }
	var actions_value = _view.get("actions", {})
	if typeof(actions_value) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var actions: Dictionary = actions_value
	var action_value = actions.get(action_name, {})
	return action_value if typeof(action_value) == TYPE_DICTIONARY else { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }

func _shop_slot_action(index: int) -> Dictionary:
	if not has_view():
		return { "allowed": false, "reason": "VIEW_NOT_READY" }
	var actions_value = _view.get("actions", {})
	if typeof(actions_value) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var actions: Dictionary = actions_value
	var slots_value = actions.get("buyShopSlots", [])
	if typeof(slots_value) != TYPE_ARRAY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var slots: Array = slots_value
	if index < 0 or index >= slots.size() or typeof(slots[index]) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "INVALID_SHOP_SLOT" }
	return slots[index]

func _prepare_phase() -> bool:
	return has_view() and String(_view.get("phase", "")) == "PREPARE"

func _current_revision() -> int:
	return int(_view.get("revision", -1))

func _next_command_id(command_type: String) -> String:
	if _command_id_provider.is_valid():
		return String(_command_id_provider.call(command_type))
	var random_bytes := Crypto.new().generate_random_bytes(16)
	return "client:%s:%s:%s" % [String(_view.get("id", "run")), command_type.to_lower(), random_bytes.hex_encode()]

func _reject(action: String, reason: String) -> bool:
	command_rejected.emit(action, reason)
	return false

func _on_runtime_view_changed(view: Dictionary) -> void:
	var previous_phase := String(_view.get("phase", ""))
	_view = view.duplicate(true)
	var next_phase := String(_view.get("phase", ""))
	view_changed.emit(_view.duplicate(true))
	if previous_phase != next_phase:
		phase_changed.emit(previous_phase, next_phase)

func _on_runtime_protocol_error(message: String) -> void:
	protocol_error.emit(message)

func _disconnect_runtime_port(runtime_port) -> void:
	if runtime_port.view_changed.is_connected(_on_runtime_view_changed):
		runtime_port.view_changed.disconnect(_on_runtime_view_changed)
	if runtime_port.protocol_error.is_connected(_on_runtime_protocol_error):
		runtime_port.protocol_error.disconnect(_on_runtime_protocol_error)
