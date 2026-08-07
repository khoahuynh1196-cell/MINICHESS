extends SceneTree

const ControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	var controller = ControllerScript.new()
	get_root().add_child(controller)
	var port = RuntimePortScript.new()
	var requests: Array = []
	var phases: Array = []
	var rejections: Array = []
	port.request_submitted.connect(func(request: Dictionary) -> void: requests.append(request))
	controller.phase_changed.connect(func(previous_phase: String, next_phase: String) -> void:
		phases.append([previous_phase, next_phase]))
	controller.command_rejected.connect(func(action: String, reason: String) -> void:
		rejections.append([action, reason]))
	controller.set_command_id_provider_for_test(func(command_type: String) -> String:
		return "test:%s" % command_type.to_lower())
	controller.attach_runtime_port(port)

	_expect(port.accept_response(_response(0, "PREPARE", {
		"refreshShop": { "allowed": true },
		"lockShop": { "allowed": true },
		"buyXp": { "allowed": false, "reason": "NOT_ENOUGH_GOLD" },
		"moveHero": { "allowed": true },
		"sellHero": { "allowed": true },
		"equipItem": { "allowed": true },
		"unequipItem": { "allowed": true },
		"startRound": { "allowed": false, "reason": "EMPTY_BOARD" },
		"resolveCombat": { "allowed": false, "reason": "WRONG_PHASE" },
		"ackPlaybackComplete": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRoundReward": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRewardHero": { "allowed": false, "reason": "NO_PENDING_HERO_REWARD" },
		"buyShopSlots": [{ "allowed": true }, { "allowed": false, "reason": "SLOT_EMPTY" }],
	})), "initial runtime response must be accepted")
	_expect(controller.has_view(), "controller must cache the accepted public view")
	_expect(phases == [["", "PREPARE"]], "initial view must emit a phase transition")

	_expect(controller.request_refresh_shop(), "allowed refresh must submit")
	_expect(requests.back() == {
		"commandId": "test:refresh_shop",
		"expectedRevision": 0,
		"type": "REFRESH_SHOP",
	}, "refresh must use the centralized command factory")
	_expect(controller.request_buy_shop_hero(0), "allowed shop slot must submit")
	_expect(requests.back().shopSlotIndex == 0, "shop request must carry its slot")
	_expect(not controller.request_buy_shop_hero(1), "disabled shop slot must be rejected")
	_expect(rejections.back() == ["buyShopSlot", "SLOT_EMPTY"], "shop rejection must expose the authoritative reason")
	_expect(not controller.request_buy_xp(), "disabled XP must be rejected")
	_expect(rejections.back() == ["buyXp", "NOT_ENOUGH_GOLD"], "XP rejection must expose the authoritative reason")
	_expect(not controller.request_start_round(), "empty board start must be rejected")
	_expect(rejections.back() == ["startRound", "EMPTY_BOARD"], "start rejection must expose the authoritative reason")

	_expect(port.accept_response(_response(1, "COMBAT", {
		"refreshShop": { "allowed": false, "reason": "WRONG_PHASE" },
		"lockShop": { "allowed": false, "reason": "WRONG_PHASE" },
		"buyXp": { "allowed": false, "reason": "WRONG_PHASE" },
		"moveHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"sellHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"equipItem": { "allowed": false, "reason": "WRONG_PHASE" },
		"unequipItem": { "allowed": false, "reason": "WRONG_PHASE" },
		"startRound": { "allowed": false, "reason": "WRONG_PHASE" },
		"resolveCombat": { "allowed": true },
		"ackPlaybackComplete": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRoundReward": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRewardHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"buyShopSlots": [{ "allowed": false, "reason": "WRONG_PHASE" }],
	})), "combat response must be accepted")
	_expect(phases.back() == ["PREPARE", "COMBAT"], "combat view must emit a phase transition")
	_expect(controller.request_resolve_combat(), "combat resolve must submit when authoritative view allows it")
	_expect(requests.back().type == "RESOLVE_COMBAT" and requests.back().expectedRevision == 1, "resolve must use the current authoritative revision")
	_expect(not controller.request_move_hero("hero-a", "board", 0), "prepare-only move must be rejected in combat")
	_expect(rejections.back() == ["moveHero", "WRONG_PHASE"], "prepare-only action must expose wrong phase")

	var playbacks: Array = []
	controller.playback_ready.connect(func(playback: Dictionary) -> void: playbacks.append(playback))
	_expect(port.accept_response(_response_with_playback(2, "PLAYBACK", {
		"refreshShop": { "allowed": false, "reason": "WRONG_PHASE" },
		"lockShop": { "allowed": false, "reason": "WRONG_PHASE" },
		"buyXp": { "allowed": false, "reason": "WRONG_PHASE" },
		"moveHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"sellHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"equipItem": { "allowed": false, "reason": "WRONG_PHASE" },
		"unequipItem": { "allowed": false, "reason": "WRONG_PHASE" },
		"startRound": { "allowed": false, "reason": "WRONG_PHASE" },
		"resolveCombat": { "allowed": false, "reason": "WRONG_PHASE" },
		"ackPlaybackComplete": { "allowed": true },
		"claimRoundReward": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRewardHero": { "allowed": false, "reason": "WRONG_PHASE" },
		"buyShopSlots": [{ "allowed": false, "reason": "WRONG_PHASE" }],
	}, { "combatId": "combat:controller-run:1:0", "events": [{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED" }] })), "playback response must be accepted")
	_expect(phases.back() == ["COMBAT", "PLAYBACK"], "playback view must emit a phase transition")
	_expect(playbacks.size() == 1 and playbacks[0].get("combatId", "") == "combat:controller-run:1:0", "playback response must emit playback_ready")
	_expect(controller.request_ack_playback_complete(), "ack must submit when authoritative view allows it")
	_expect(requests.back().type == "ACK_PLAYBACK_COMPLETE" and requests.back().expectedRevision == 2, "ack must use the current authoritative revision")

	var copied_view := controller.current_view()
	copied_view["phase"] = "MUTATED"
	_expect(String(controller.current_view().get("phase", "")) == "PLAYBACK", "current_view must return a deep copy")

	controller.attach_runtime_port(null)
	_expect(not controller.request_ack_playback_complete(), "commands must fail when runtime is detached")
	_expect(rejections.back() == ["ACK_PLAYBACK_COMPLETE", "RUNTIME_NOT_ATTACHED"], "detached runtime must emit an explicit reason")
	controller.queue_free()

	# A cold attach onto a runtime port that already holds a restored
	# PLAYBACK-phase view (e.g. after the app relaunches mid-combat) must
	# still surface the stored playback, even though no live
	# combat_playback_ready ever fires for it.
	var resumed_controller = ControllerScript.new()
	get_root().add_child(resumed_controller)
	var resumed_port = RuntimePortScript.new()
	var resumed_response := _response(9, "PLAYBACK", { "ackPlaybackComplete": { "allowed": true } })
	resumed_response["view"]["lastCombat"] = {
		"round": 1, "winner": "player", "survivingEnemyUnits": 0, "resultHash": "resumed-result", "finalTick": 1, "reason": "elimination",
		"playback": { "combatId": "combat:resumed-run:1:0", "events": [{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED" }] },
	}
	resumed_port.accept_response(resumed_response)
	var resumed_playbacks: Array = []
	resumed_controller.playback_ready.connect(func(playback: Dictionary) -> void: resumed_playbacks.append(playback))
	resumed_controller.attach_runtime_port(resumed_port)
	_expect(resumed_playbacks.size() == 1 and resumed_playbacks[0].get("combatId", "") == "combat:resumed-run:1:0",
		"cold attach into an existing PLAYBACK view must re-emit its stored playback")
	resumed_controller.queue_free()
	_finish()

func _response(revision: int, phase: String, actions: Dictionary) -> Dictionary:
	return {
		"revision": revision,
		"replayed": false,
		"view": {
			"id": "controller-run",
			"revision": revision,
			"phase": phase,
			"round": 1,
			"gold": 0,
			"health": 30,
			"board": [],
			"bench": [],
			"shop": [],
			"actions": actions,
		},
	}

func _response_with_playback(revision: int, phase: String, actions: Dictionary, playback: Dictionary) -> Dictionary:
	var response := _response(revision, phase, actions)
	response["playback"] = playback
	return response

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS adventure_controller_test")
	quit(0)
