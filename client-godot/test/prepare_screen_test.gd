extends SceneTree

const PrepareScreenScript = preload("res://scripts/ui/prepare_screen.gd")

var _failed := false

func _init() -> void:
	var screen = PrepareScreenScript.new()
	screen.bind_run(_prepare_view())
	_expect(_label(screen, "GoldValue") == "12 Gold", "Prepare header must render gold from the authoritative public view")
	_expect(_label(screen, "HealthValue") == "31 HP", "Prepare header must render health from the authoritative public view")
	_expect(_label(screen, "LevelValue") == "Level 4", "Prepare header must render level from the authoritative public view")
	_expect(_all_core_controls_fit(screen), "Prepare core controls must fit within the 1080 x 1920 portrait viewport")
	_expect(not _button(screen, "BuySlot0").disabled and not _button(screen, "BuyXp").disabled and not _button(screen, "StartRound").disabled, "Prepare controls must be available during PREPARE")

	var intents: Array = []
	screen.buy_shop_slot.connect(func(index: int) -> void: intents.append(["buy", index]))
	screen.buy_xp.connect(func() -> void: intents.append(["xp"]))
	screen.lock_shop.connect(func() -> void: intents.append(["lock"]))
	screen.start_round.connect(func() -> void: intents.append(["start"]))
	_button(screen, "BuySlot0").pressed.emit()
	_button(screen, "BuyXp").pressed.emit()
	_button(screen, "LockShop").pressed.emit()
	_button(screen, "StartRound").pressed.emit()
	_expect(intents == [["buy", 0], ["xp"], ["lock"], ["start"]], "Prepare controls must emit typed presentation intents")

	var combat_view := _prepare_view()
	combat_view["state"] = "COMBAT"
	screen.bind_run(combat_view)
	_expect(_all_core_controls_disabled(screen), "Prepare controls must be disabled outside PREPARE")
	screen.free()
	if _failed:
		quit(1)
		return
	print("PASS prepare_screen_test")
	quit(0)

func _prepare_view() -> Dictionary:
	var board: Array = []
	board.resize(24)
	board.fill(null)
	board[0] = { "instanceId": "board-h01", "heroId": "H01", "stars": 1 }
	return {
		"id": "prepare-screen-fixture", "state": "PREPARE", "round": 3, "revision": 7,
		"gold": 12, "health": 31, "level": 4, "experience": 2, "experienceToNext": 10, "boardCap": 4,
		"shop": [
			{ "heroId": "H01", "cost": 1 }, { "heroId": "H02", "cost": 2 }, { "heroId": "H03", "cost": 3 }, { "heroId": "H04", "cost": 4 }, { "heroId": "H20", "cost": 5 },
		],
		"bench": [{ "instanceId": "bench-h02", "heroId": "H02", "stars": 1 }],
		"board": board,
		"items": [{ "instanceId": "item-1", "itemId": "I01", "kind": "normal" }],
	}

func _label(screen: Control, node_name: String) -> String:
	var label: Label = screen.find_child(node_name, true, false)
	return label.text if label != null else ""

func _button(screen: Control, node_name: String) -> Button:
	return screen.find_child(node_name, true, false) as Button

func _all_core_controls_fit(screen: Control) -> bool:
	for control in _buttons(screen):
		var rect := control.get_rect()
		if rect.position.x < 0.0 or rect.position.y < 0.0 or rect.end.x > 1080.0 or rect.end.y > 1920.0:
			return false
	return true

func _all_core_controls_disabled(screen: Control) -> bool:
	for control in _buttons(screen):
		if not control.disabled:
			return false
	return true

func _buttons(root: Node) -> Array[Button]:
	var buttons: Array[Button] = []
	for child in root.get_children():
		if child is Button:
			buttons.append(child)
		buttons.append_array(_buttons(child))
	return buttons

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
