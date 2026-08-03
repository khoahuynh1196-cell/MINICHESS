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
	var interaction_intents: Array = []
	if screen.has_signal("formation_hero_pressed"):
		screen.connect("formation_hero_pressed", func(instance_id: String, destination: int) -> void: interaction_intents.append(["hero", instance_id, destination]))
	if screen.has_signal("formation_destination_selected"):
		screen.connect("formation_destination_selected", func(destination: int) -> void: interaction_intents.append(["destination", destination]))
	if screen.has_signal("item_selected"):
		screen.connect("item_selected", func(instance_id: String) -> void: interaction_intents.append(["item", instance_id]))
	if screen.has_signal("collection_requested"):
		screen.connect("collection_requested", func() -> void: interaction_intents.append(["collection"]))
	_expect(screen.has_signal("formation_hero_pressed") and screen.has_signal("formation_destination_selected") and screen.has_signal("item_selected") and screen.has_signal("collection_requested"), "Prepare must expose formation, item, and collection intents")
	_button(screen, "BoardCell00").pressed.emit()
	_button(screen, "BoardCell01").pressed.emit()
	var item_button := _button(screen, "InventoryItem0")
	_expect(item_button != null, "Prepare inventory must expose an accessible item action")
	if item_button != null:
		item_button.pressed.emit()
	_button(screen, "ViewCollection").pressed.emit()
	_expect(interaction_intents == [["hero", "board-h01", 12], ["destination", 13], ["item", "item-1"], ["collection"]], "Prepare interaction controls must emit typed intents without mutating the run")
	var sell_intents: Array[String] = []
	screen.sell_hero.connect(func(instance_id: String) -> void: sell_intents.append(instance_id))
	var selected_view := _prepare_view()
	selected_view["selectedHeroInstanceId"] = "bench-h02"
	screen.bind_run(selected_view)
	var sell_button := _button(screen, "SellSelected")
	_expect(sell_button != null and not sell_button.disabled, "Prepare must expose an enabled sell action for the selected hero")
	if sell_button != null:
		sell_button.pressed.emit()
	_expect(sell_intents == ["bench-h02"], "Prepare sell action must emit the selected immutable hero instance ID")

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
