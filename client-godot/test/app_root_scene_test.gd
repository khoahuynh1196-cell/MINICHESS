extends SceneTree

## Loads the real scenes/app/app_root.tscn (not a hand-built stand-in) and
## drives it through PREPARE -> COMBAT -> PLAYBACK -> REWARD -> COMPLETE via
## scripted responses fed straight to its AdventureRuntimePort, exactly as
## Mission 6's headless tests already do. This is the "scene smoke test
## before migration" Mission 7 asks for: it proves the composition root
## boots, wires every layer, and navigates correctly end to end.

const AppRootScene = preload("res://scenes/app/app_root.tscn")

var _failed := false

func _init() -> void:
	var app_root = AppRootScene.instantiate()
	get_root().add_child(app_root)

	_expect(app_root.app_controller.current_screen_id == "home", "app root must boot on the home screen")

	_expect(app_root.runtime_port.accept_response(_response(0, "PREPARE")), "prepare response must be accepted")
	_expect(app_root.app_controller.current_screen_id == "prepare", "a PREPARE view must navigate to the real prepare screen")
	var prepare_screen = app_root.app_controller.screen_node("prepare")
	var header := prepare_screen.get_node("Root/Header") as Label
	_expect(header.text.begins_with("PREPARE | Round 1"), "the real prepare screen must render the live domain view")

	_expect(app_root.runtime_port.accept_response(_response(1, "COMBAT")), "combat response must be accepted")
	_expect(app_root.app_controller.current_screen_id == "combat", "a COMBAT view must navigate to the combat screen")

	_expect(app_root.runtime_port.accept_response(_response(2, "REWARD")), "reward response must be accepted")
	_expect(app_root.app_controller.current_screen_id == "reward", "a REWARD view must navigate to the reward screen")

	_expect(app_root.runtime_port.accept_response(_response(3, "COMPLETE")), "complete response must be accepted")
	_expect(app_root.app_controller.current_screen_id == "result", "a COMPLETE view must navigate to the result screen")

	app_root.queue_free()
	_finish()

func _response(revision: int, phase: String) -> Dictionary:
	var board: Array = []
	board.resize(16)
	board.fill(null)
	var bench: Array = []
	bench.resize(8)
	bench.fill(null)
	var shop: Array = []
	shop.resize(5)
	shop.fill(null)
	return {
		"revision": revision,
		"replayed": false,
		"view": {
			"id": "app-root-run",
			"revision": revision,
			"phase": phase,
			"rulesetVersion": "production-rules-0.1.0",
			"contentVersion": "alpha-0.3.0",
			"round": 1,
			"gold": 8,
			"health": 30,
			"level": 3,
			"experience": 0,
			"experienceToNext": 10,
			"boardCap": 3,
			"shopOdds": [55, 35, 10, 0, 0],
			"shop": shop,
			"shopLocked": false,
			"freeRefreshes": 0,
			"board": board,
			"bench": bench,
			"items": [],
			"rewardHeroes": [],
			"traits": [],
			"actions": { "startRound": { "allowed": false, "reason": "EMPTY_BOARD" }, "buyShopSlots": [] },
		},
	}

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS app_root_scene_test")
	quit(0)
