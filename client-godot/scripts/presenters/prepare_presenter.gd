class_name PreparePresenter
extends RefCounted

## Adapts one PREPARE-phase AdventureView into what the Prepare screen
## needs, and forwards player intent back to the domain through the
## attached AdventureController. This presenter never decides whether an
## action succeeds -- it only reads the domain-provided `actions`
## availability contract (see game-core/src/adventure/view.ts) and relays
## commands; the controller/runtime is the only place a command can be
## accepted or rejected.

signal updated(view: Dictionary)

var _controller
var _view: Dictionary = {}

func attach_controller(controller) -> void:
	_controller = controller

func bind(view: Dictionary) -> void:
	_view = view.duplicate(true)
	updated.emit(current_view())

func current_view() -> Dictionary:
	return _view.duplicate(true)

func gold() -> int:
	return int(_view.get("gold", 0))

func health() -> int:
	return int(_view.get("health", 0))

func round_number() -> int:
	return int(_view.get("round", 0))

func level() -> int:
	return int(_view.get("level", 0))

func board_cap() -> int:
	return int(_view.get("boardCap", 0))

func shop() -> Array:
	return Array(_view.get("shop", []))

func board() -> Array:
	return Array(_view.get("board", []))

func bench() -> Array:
	return Array(_view.get("bench", []))

func deployed_count() -> int:
	return board().filter(func(hero): return hero != null).size()

func action(name: String) -> Dictionary:
	var actions_value = _view.get("actions", {})
	if typeof(actions_value) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var action_value = Dictionary(actions_value).get(name, {})
	return Dictionary(action_value) if typeof(action_value) == TYPE_DICTIONARY else { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }

func shop_slot_action(index: int) -> Dictionary:
	var actions_value = _view.get("actions", {})
	if typeof(actions_value) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var slots_value = Dictionary(actions_value).get("buyShopSlots", [])
	if typeof(slots_value) != TYPE_ARRAY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var slots: Array = slots_value
	if index < 0 or index >= slots.size() or typeof(slots[index]) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "INVALID_SHOP_SLOT" }
	return Dictionary(slots[index])

func request_buy_shop_hero(index: int) -> bool:
	return _controller != null and _controller.request_buy_shop_hero(index)

func request_refresh_shop() -> bool:
	return _controller != null and _controller.request_refresh_shop()

func request_move_hero(hero_instance_id: String, destination_kind: String, destination_index: int) -> bool:
	return _controller != null and _controller.request_move_hero(hero_instance_id, destination_kind, destination_index)

func request_sell_hero(hero_instance_id: String) -> bool:
	return _controller != null and _controller.request_sell_hero(hero_instance_id)

func request_start_round() -> bool:
	return _controller != null and _controller.request_start_round()
