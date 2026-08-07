extends SceneTree

const AppControllerScript = preload("res://scripts/app/app_controller.gd")
const AdventureControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const AdventurePresenterScript = preload("res://scripts/adventure/adventure_presenter.gd")
const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	# End-to-end wiring smoke test for the Mission 7 navigation skeleton:
	# RuntimePort -> AdventureController -> AdventurePresenter -> AppController.
	# No screen here computes gameplay state; every transition is driven by
	# scripted domain-shaped responses, exactly as a real bridge would feed them.
	var app = AppControllerScript.new()
	var adventure_controller = AdventureControllerScript.new()
	var presenter = AdventurePresenterScript.new()
	get_root().add_child(app)
	get_root().add_child(adventure_controller)
	get_root().add_child(presenter)

	var home := Control.new()
	var prepare := Control.new()
	var combat := Control.new()
	var reward := Control.new()
	var result := Control.new()
	for screen in [home, prepare, combat, reward, result]:
		get_root().add_child(screen)
	app.register_screen("home", home)
	app.register_screen("prepare", prepare)
	app.register_screen("combat", combat)
	app.register_screen("reward", reward)
	app.register_screen("result", result)
	app.show_home()
	_expect(home.visible and not prepare.visible, "show_home must present only the home screen")

	var screens: Array = []
	app.screen_changed.connect(func(screen_id: String) -> void: screens.append(screen_id))

	presenter.attach_controller(adventure_controller)
	app.attach_presenter(presenter)

	var port = RuntimePortScript.new()
	adventure_controller.attach_runtime_port(port)

	_expect(port.accept_response(_response(0, "PREPARE")), "prepare response must be accepted")
	_expect(app.current_screen_id == "prepare" and prepare.visible and not home.visible,
		"a PREPARE view must navigate to the prepare screen and hide every other screen")

	_expect(port.accept_response(_response(1, "COMBAT")), "combat response must be accepted")
	_expect(app.current_screen_id == "combat" and combat.visible and not prepare.visible,
		"a COMBAT view must navigate to the combat screen")

	_expect(port.accept_response(_response(2, "PLAYBACK")), "playback response must be accepted")
	_expect(app.current_screen_id == "combat" and combat.visible,
		"a PLAYBACK view must stay on the combat screen (same presentation, recorded events)")

	_expect(port.accept_response(_response(3, "REWARD")), "reward response must be accepted")
	_expect(app.current_screen_id == "reward" and reward.visible and not combat.visible,
		"a REWARD view must navigate to the reward screen")

	_expect(port.accept_response(_response(4, "COMPLETE")), "complete response must be accepted")
	_expect(app.current_screen_id == "result" and result.visible and not reward.visible,
		"a COMPLETE view must navigate to the result screen")

	_expect(screens == ["prepare", "combat", "combat", "reward", "result"],
		"every navigation must be observable through screen_changed")

	for screen in [home, prepare, combat, reward, result]:
		screen.queue_free()
	presenter.queue_free()
	adventure_controller.queue_free()
	app.queue_free()
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
			"id": "app-controller-run",
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
			"actions": {},
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
	print("PASS app_controller_test")
	quit(0)
