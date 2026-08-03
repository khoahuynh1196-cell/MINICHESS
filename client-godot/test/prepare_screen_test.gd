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
	_expect(_label(screen, "TierOdds") == "T1 45%  T2 35%  T3 18%  T4 2%  T5 0%", "Prepare must pass authoritative shop odds into its presentation panel")
	_expect(_button(screen, "LockShop") != null and not _button(screen, "LockShop").disabled, "Prepare must offer the server-backed shop lock control")
	for index in range(1, 8):
		var bench_button := _button(screen, "BenchSlot%02d" % index)
		_expect(bench_button.text == "Empty" and bench_button.tooltip_text == "Empty bench slot %d" % (index + 1) and bench_button.get_rect().end.x <= 1080.0, "Empty bench controls must use short labels that fit without collision")
	_expect(_board_cell_count(screen) == 12 and _button(screen, "BoardCell11") != null and _button(screen, "BoardCell12") == null, "Prepare must render exactly the 12 legal player-half board slots")
	_expect(screen.find_child("TraitBottomSheet", true, false) != null, "Prepare must render trait chips in a bottom sheet")
	_expect(_trait_chip_texts(screen).any(func(text): return text.contains("Cat  1 / 6")), "trait chips must count board heroes only, never matching bench heroes")
	var combined_view := _prepare_view()
	combined_view["starUpgrade"] = { "heroInstanceId": "board-h01", "heroName": "Cotton Bulwark", "stars": 2 }
	combined_view["reducedMotion"] = true
	screen.bind_run(combined_view)
	var star_upgrade := screen.find_child("StarUpgradePresentation", true, false)
	_expect(star_upgrade != null and not bool(star_upgrade.get_meta("animated", true)) and _label(screen, "StarUpgradeMessage").contains("Three copies combined"), "three-copy star upgrades must use the reduced-motion presentation")

	var intents: Array = []
	screen.buy_shop_slot.connect(func(index: int) -> void: intents.append(["buy", index]))
	screen.buy_xp.connect(func() -> void: intents.append(["xp"]))
	screen.lock_shop.connect(func() -> void: intents.append(["lock"]))
	screen.start_round.connect(func() -> void: intents.append(["start"]))
	_button(screen, "BuySlot0").pressed.emit()
	_button(screen, "BuyXp").pressed.emit()
	var lock_control := _button(screen, "LockShop")
	if lock_control != null:
		lock_control.pressed.emit()
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
	_expect(_label(screen, "SellFeedback") == "Sell requested; awaiting server confirmation.", "Selling must provide immediate non-economic feedback while awaiting the server")
	screen.bind_run(selected_view)
	_expect(_label(screen, "SellFeedback").is_empty(), "A new authoritative run view must clear pending sell feedback")

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
	board.resize(12)
	board.fill(null)
	board[0] = { "instanceId": "board-h01", "heroId": "H01", "stars": 1 }
	return {
		"id": "prepare-screen-fixture", "state": "PREPARE", "round": 3, "revision": 7,
		"gold": 12, "health": 31, "level": 4, "experience": 2, "experienceToNext": 10, "boardCap": 4,
		"shopOdds": { "tier1": 45, "tier2": 35, "tier3": 18, "tier4": 2, "tier5": 0 },
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

func _board_cell_count(screen: Control) -> int:
	var count := 0
	for button in _buttons(screen):
		if String(button.name).begins_with("BoardCell"):
			count += 1
	return count

func _trait_chip_texts(screen: Control) -> Array[String]:
	var texts: Array[String] = []
	for child in _labels(screen):
		if String(child.name).begins_with("TraitChipLabel"):
			texts.append(child.text)
	return texts

func _labels(root: Node) -> Array[Label]:
	var labels: Array[Label] = []
	for child in root.get_children():
		if child is Label:
			labels.append(child)
		labels.append_array(_labels(child))
	return labels

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
