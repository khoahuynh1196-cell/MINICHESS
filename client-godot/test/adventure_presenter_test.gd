extends SceneTree

const ControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const PresenterScript = preload("res://scripts/adventure/adventure_presenter.gd")
const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	var controller = ControllerScript.new()
	var presenter = PresenterScript.new()
	get_root().add_child(controller)
	get_root().add_child(presenter)
	var port = RuntimePortScript.new()
	var routed: Array = []
	var errors: Array = []
	var playbacks: Array = []
	presenter.prepare_presented.connect(func(view: Dictionary) -> void: routed.append(["prepare", view]))
	presenter.combat_presented.connect(func(view: Dictionary) -> void: routed.append(["combat", view]))
	presenter.reward_presented.connect(func(view: Dictionary) -> void: routed.append(["reward", view]))
	presenter.complete_presented.connect(func(view: Dictionary) -> void: routed.append(["complete", view]))
	presenter.playback_ready.connect(func(playback: Dictionary) -> void: playbacks.append(playback))
	presenter.presentation_error.connect(func(message: String) -> void: errors.append(message))
	controller.attach_runtime_port(port)
	presenter.attach_controller(controller)

	_expect(port.accept_response(_response(0, "PREPARE")), "prepare response must be accepted")
	_expect(routed.back()[0] == "prepare" and String(routed.back()[1].get("phase", "")) == "PREPARE", "prepare view must route to prepare presenter")
	_expect(port.accept_response(_response(1, "COMBAT")), "combat response must be accepted")
	_expect(routed.back()[0] == "combat", "combat view must route to combat presenter")

	var playback_response := _response(2, "PLAYBACK")
	playback_response["playback"] = { "combatId": "combat:presenter-run:1:0", "events": [{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED" }] }
	_expect(port.accept_response(playback_response), "playback response must be accepted")
	_expect(routed.back()[0] == "combat" and String(routed.back()[1].get("phase", "")) == "PLAYBACK", "PLAYBACK must reuse the combat presenter route")
	_expect(playbacks.size() == 1 and playbacks[0].get("combatId", "") == "combat:presenter-run:1:0", "playback response must emit playback_ready")

	_expect(port.accept_response(_response(3, "REWARD")), "reward response must be accepted")
	_expect(routed.back()[0] == "reward", "reward view must route to reward presenter")
	_expect(port.accept_response(_response(4, "COMPLETE")), "complete response must be accepted")
	_expect(routed.back()[0] == "complete", "complete view must route to result presenter")
	_expect(String(presenter.current_model().get("phase", "")) == "COMPLETE", "presenter must retain the latest typed model")

	var invalid := _response(5, "PREPARE")
	invalid["view"]["board"] = []
	_expect(port.accept_response(invalid), "runtime port accepts structurally public views")
	_expect(errors.back() == "Adventure view is incompatible with the active ruleset", "presenter must reject rules-incompatible collection sizes")
	_expect(String(presenter.current_model().get("phase", "")) == "COMPLETE", "invalid views must not replace the previous model")

	presenter.attach_controller(null)
	controller.queue_free()
	presenter.queue_free()
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
			"id": "presenter-run",
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
			"actions": {
				"refreshShop": { "allowed": phase == "PREPARE" },
				"lockShop": { "allowed": phase == "PREPARE" },
				"buyXp": { "allowed": false, "reason": "NOT_ENOUGH_GOLD" },
				"startRound": { "allowed": false, "reason": "EMPTY_BOARD" },
				"resolveCombat": { "allowed": phase == "COMBAT" },
				"claimRoundReward": { "allowed": phase == "REWARD" },
				"claimRewardHero": { "allowed": false, "reason": "NO_PENDING_HERO_REWARD" },
				"buyShopSlots": [{ "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }],
			},
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
	print("PASS adventure_presenter_test")
	quit(0)
