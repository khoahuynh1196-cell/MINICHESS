extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	controller._create_mobile_ui()
	_expect(controller.screen_router.current_screen_id == "lobby", "the routed experience must start at lobby")
	for screen_id in ["map", "collection", "settings", "lobby"]:
		controller.show_mobile_screen(screen_id)
		_expect(controller.screen_router.current_screen_id == screen_id, "screen flow must visit %s" % screen_id)
		_expect(controller.screen_router.visible_screen_count() == 1, "screen flow must keep one screen visible")
	controller.apply_run_view({
		"id": "run-screen-flow", "state": "PREPARE", "round": 1, "revision": 0,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shop": [], "bench": [], "board": _empty_board(), "items": [],
	})
	_expect(controller.screen_router.current_screen_id == "prepare", "a prepared authoritative run must route to prepare")
	controller.apply_run_view({
		"id": "run-screen-flow", "state": "COMBAT", "round": 1, "revision": 1,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shop": [], "bench": [], "board": _empty_board(), "items": [],
	})
	_expect(controller.screen_router.current_screen_id == "combat", "combat state must route to combat presentation")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS screen_flow_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _empty_board() -> Array:
	var board: Array = []
	board.resize(12)
	board.fill(null)
	return board
