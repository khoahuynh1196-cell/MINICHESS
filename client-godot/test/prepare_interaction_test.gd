extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	var commands: Array = []
	controller.command_requested.connect(func(payload: Dictionary) -> void: commands.append(payload))
	controller._create_mobile_ui()
	controller.apply_run_view({
		"id": "run-prepare-ui", "state": "PREPARE", "round": 1, "revision": 4,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shop": [], "bench": [{ "instanceId": "bench-a", "heroId": "H01", "stars": 1 }],
		"board": _board(), "items": [{ "instanceId": "item-a", "itemId": "I01", "kind": "normal" }],
	})
	controller.select_formation_hero("bench-a")
	controller.request_selected_formation_move(12)
	_expect(commands.size() == 1 and String(commands[0].type) == "MOVE_HERO", "tap formation flow must emit a MOVE_HERO command")
	_expect(int(commands[0].destination) == 12, "formation command must preserve the selected destination")
	controller.select_item("item-a")
	controller.request_equip_item("item-a", "bench-a")
	_expect(commands.size() == 2 and String(commands[1].type) == "EQUIP_ITEM", "selected item flow must emit an EQUIP_ITEM command")
	controller.show_mobile_screen("collection")
	_expect(controller.screen_router.current_screen_id == "collection", "collection remains reachable after Prepare interaction")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS prepare_interaction_test")
	quit(0)

func _board() -> Array:
	var board: Array = []
	board.resize(12)
	board.fill(null)
	return board

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
