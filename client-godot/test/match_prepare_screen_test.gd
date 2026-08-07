extends SceneTree

const PrepareScreenScript = preload("res://scripts/screens/match/prepare_screen.gd")
const PreparePresenterScript = preload("res://scripts/presenters/prepare_presenter.gd")
const AdventureControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	var screen = PrepareScreenScript.new()
	get_root().add_child(screen)
	var presenter = PreparePresenterScript.new()
	var controller = AdventureControllerScript.new()
	get_root().add_child(controller)
	var port = RuntimePortScript.new()
	var requests: Array = []
	port.request_submitted.connect(func(request: Dictionary) -> void: requests.append(request))
	controller.set_command_id_provider_for_test(func(command_type: String) -> String: return "test:%s" % command_type.to_lower())
	presenter.attach_controller(controller)
	screen.attach_presenter(presenter)
	controller.attach_runtime_port(port)

	_expect(port.accept_response(_response(0, {
		"startRound": { "allowed": false, "reason": "EMPTY_BOARD" },
		"buyShopSlots": [{ "allowed": true }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }],
	})), "prepare response must be accepted")
	presenter.bind(controller.current_view())

	var header := screen.get_node("Root/Header") as Label
	_expect(header.text.begins_with("PREPARE | Round 1 | Lv 3 | Gold 8 | HP 30"), "header must render the real domain view, not client-fabricated text")

	var start_button := screen.get_node("Root/StartRoundButton") as Button
	_expect(start_button.disabled and start_button.tooltip_text == "EMPTY_BOARD",
		"start round must be disabled with the domain-provided reason")

	var shop_row := screen.get_node("Root/ShopRow") as HBoxContainer
	_expect(shop_row.get_child_count() == 5, "shop row must render one button per shop slot")
	var first_slot := shop_row.get_child(0) as Button
	var second_slot := shop_row.get_child(1) as Button
	_expect(not first_slot.disabled, "an affordable shop slot must be enabled")
	_expect(second_slot.disabled and second_slot.tooltip_text == "SLOT_EMPTY", "an empty shop slot must be disabled with its reason")

	first_slot.pressed.emit()
	_expect(requests.size() == 1 and requests[0].type == "BUY_SHOP_HERO" and requests[0].shopSlotIndex == 0,
		"tapping an enabled shop slot must dispatch a real BUY_SHOP_HERO command through the controller")

	second_slot.pressed.emit()
	_expect(requests.size() == 1, "tapping a disabled shop slot must not dispatch anything (Godot Button.disabled blocks the press)")

	screen.queue_free()
	controller.queue_free()
	_finish()

func _response(revision: int, actions: Dictionary) -> Dictionary:
	var board: Array = []
	board.resize(16)
	board.fill(null)
	var bench: Array = []
	bench.resize(8)
	bench.fill(null)
	var full_actions := {
		"refreshShop": { "allowed": true }, "lockShop": { "allowed": true },
		"buyXp": { "allowed": true }, "moveHero": { "allowed": true }, "sellHero": { "allowed": true },
		"equipItem": { "allowed": true }, "unequipItem": { "allowed": true },
		"claimRewardHero": { "allowed": false, "reason": "NO_PENDING_HERO_REWARD" },
		"resolveCombat": { "allowed": false, "reason": "WRONG_PHASE" },
		"ackPlaybackComplete": { "allowed": false, "reason": "WRONG_PHASE" },
		"claimRoundReward": { "allowed": false, "reason": "WRONG_PHASE" },
	}
	for key in actions:
		full_actions[key] = actions[key]
	return {
		"revision": revision,
		"replayed": false,
		"view": {
			"id": "prepare-screen-run",
			"revision": revision,
			"phase": "PREPARE",
			"round": 1,
			"gold": 8,
			"health": 30,
			"level": 3,
			"boardCap": 3,
			"board": board,
			"bench": bench,
			"shop": [{ "heroId": "H01", "cost": 1, "rarity": 1 }, null, null, null, null],
			"actions": full_actions,
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
	print("PASS match_prepare_screen_test")
	quit(0)
