class_name PrepareScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const TraitPanelScript = preload("res://scripts/ui/trait_panel.gd")
const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const FormationSlotButtonScript = preload("res://scripts/ui/formation_slot_button.gd")
const ShopPanelScript = preload("res://scripts/ui/shop_panel.gd")

const PORTRAIT_RECT := Rect2(0.0, 0.0, 1080.0, 1920.0)
const BOARD_COLUMNS := 3
const PLAYER_BOARD_ROWS := 4
const SHOP_SLOT_COUNT := 5
const BENCH_SLOT_COUNT := 8

signal buy_shop_slot(index: int)
signal refresh_shop
signal lock_shop
signal buy_xp
signal start_round
signal sell_hero(instance_id: String)
signal formation_hero_pressed(instance_id: String, destination: int)
signal formation_destination_selected(destination: int)
signal formation_drag_dropped(instance_id: String, destination: int)
signal item_selected(instance_id: String)
signal item_equip_requested(item_instance_id: String, hero_instance_id: String)
signal unequip_item_requested(instance_id: String)
signal collection_requested

var _view: Dictionary = {}
var _prepare_enabled := false
var _selected_hero_instance_id := ""
var _selected_item_instance_id := ""
var _sell_feedback := ""
var _item_feedback := ""
var _star_upgrade: Dictionary = {}
var _reduced_motion := false

func _init() -> void:
	name = "PrepareScreen"
	position = PORTRAIT_RECT.position
	size = PORTRAIT_RECT.size
	mouse_filter = Control.MOUSE_FILTER_STOP

func bind_run(view: Dictionary) -> void:
	_view = view.duplicate(true)
	_sell_feedback = ""
	_prepare_enabled = String(_view.get("state", "")) == "PREPARE"
	_selected_hero_instance_id = String(_view.get("selectedHeroInstanceId", ""))
	_selected_item_instance_id = String(_view.get("selectedItemInstanceId", ""))
	_item_feedback = String(_view.get("itemFeedback", ""))
	_star_upgrade = Dictionary(_view.get("starUpgrade", {}))
	_reduced_motion = bool(_view.get("reducedMotion", false))
	_rebuild()

func _rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_background()
	_header()
	_board()
	_star_upgrade_presentation()
	_bench()
	_traits()
	_inventory()
	_shop()
	_action_rail()

func _background() -> void:
	var background := ColorRect.new()
	background.name = "Background"
	background.position = PORTRAIT_RECT.position
	background.size = PORTRAIT_RECT.size
	background.color = ThemeTokensScript.NAVY
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)

func _header() -> void:
	_panel("HeaderPanel", Rect2(40.0, 40.0, 1000.0, 120.0), ThemeTokensScript.STONE_RAISED)
	_label("PrepareTitle", "PREPARE YOUR PARTY", Rect2(64.0, 55.0, 520.0, 38.0), ThemeTokensScript.TYPE_SECTION, ThemeTokensScript.GOLD)
	_label("RoundValue", "Round %d" % int(_view.get("round", 0)), Rect2(64.0, 105.0, 180.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.MUTED)
	_label("HealthValue", "%d HP" % int(_view.get("health", 0)), Rect2(280.0, 105.0, 150.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	_label("GoldValue", "%d Gold" % int(_view.get("gold", 0)), Rect2(460.0, 105.0, 180.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.GOLD)
	_label("LevelValue", "Level %d" % int(_view.get("level", 0)), Rect2(675.0, 105.0, 140.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PLAYER)
	_label("ExperienceValue", "%d / %d XP" % [int(_view.get("experience", 0)), int(_view.get("experienceToNext", 0))], Rect2(835.0, 105.0, 160.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.MUTED)

func _board() -> void:
	_panel("BoardPanel", Rect2(40.0, 175.0, 1000.0, 520.0))
	_label("BoardHeading", "FORMATION  •  %d / %d deployed" % [_deployed_count(), int(_view.get("boardCap", 0))], Rect2(64.0, 190.0, 600.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var board: Array = Array(_view.get("board", []))
	for index in BOARD_COLUMNS * PLAYER_BOARD_ROWS:
		var hero = board[index] if index < board.size() else null
		var column := index % BOARD_COLUMNS
		var row := index / BOARD_COLUMNS
		var text := "Open tile"
		if hero != null:
			text = "%s  ★%d" % [_hero_name(hero), int(hero.get("stars", 1))]
		var selected := hero != null and String(hero.get("instanceId", "")) == _selected_hero_instance_id
		var cell := _formation_slot("BoardCell%02d" % index, text, Rect2(60.0 + column * 325.0, 230.0 + row * 56.0, 310.0, 48.0), ThemeTokensScript.GOLD if selected else ThemeTokensScript.STONE_RAISED if hero != null else ThemeTokensScript.PLAYER, String(hero.get("instanceId", "")) if hero != null else "", 12 + index)
		cell.move_dropped.connect(func(instance_id: String, destination: int) -> void: formation_drag_dropped.emit(instance_id, destination))
		cell.item_equip_dropped.connect(func(item_instance_id: String, hero_instance_id: String) -> void: item_equip_requested.emit(item_instance_id, hero_instance_id))
		if hero == null:
			cell.pressed.connect(_emit_formation_destination.bind(12 + index))
		else:
			cell.pressed.connect(_emit_formation_hero.bind(String(hero.get("instanceId", "")), 12 + index))

func _bench() -> void:
	_panel("BenchPanel", Rect2(40.0, 715.0, 1000.0, 150.0))
	_label("BenchHeading", "BENCH  •  %d / %d" % [Array(_view.get("bench", [])).size(), BENCH_SLOT_COUNT], Rect2(64.0, 730.0, 360.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var bench: Array = Array(_view.get("bench", []))
	for index in BENCH_SLOT_COUNT:
		var hero = bench[index] if index < bench.size() else null
		var selected := hero != null and String(hero.get("instanceId", "")) == _selected_hero_instance_id
		var button := _formation_slot("BenchSlot%02d" % index, "Empty" if hero == null else _hero_name(hero), Rect2(60.0 + index * 123.0, 775.0, 116.0, 58.0), ThemeTokensScript.GOLD if selected else ThemeTokensScript.STONE_RAISED if hero != null else ThemeTokensScript.PLAYER, String(hero.get("instanceId", "")) if hero != null else "", index)
		if hero == null:
			button.tooltip_text = "Empty bench slot %d" % (index + 1)
		button.move_dropped.connect(func(instance_id: String, destination: int) -> void: formation_drag_dropped.emit(instance_id, destination))
		button.item_equip_dropped.connect(func(item_instance_id: String, hero_instance_id: String) -> void: item_equip_requested.emit(item_instance_id, hero_instance_id))
		if hero == null:
			button.pressed.connect(_emit_formation_destination.bind(index))
		else:
			button.pressed.connect(_emit_formation_hero.bind(String(hero.get("instanceId", "")), index))

func _traits() -> void:
	var trait_panel := TraitPanelScript.new()
	trait_panel.name = "TraitBottomSheet"
	trait_panel.position = Vector2(40.0, 1545.0)
	trait_panel.size = Vector2(1000.0, 295.0)
	trait_panel.bind_board_heroes(Array(_view.get("board", [])), _hero_catalog())
	add_child(trait_panel)

func _inventory() -> void:
	var inventory := ItemInventoryScript.new()
	inventory.name = "InventoryPanel"
	inventory.position = Vector2(40.0, 995.0)
	inventory.size = Vector2(1000.0, 135.0)
	inventory.bind_inventory(Array(_view.get("items", [])), _heroes_for_inventory(), _selected_item_instance_id, _prepare_enabled, _item_feedback)
	inventory.item_selected.connect(func(instance_id: String) -> void: item_selected.emit(instance_id))
	inventory.equip_requested.connect(func(item_instance_id: String, hero_instance_id: String) -> void: item_equip_requested.emit(item_instance_id, hero_instance_id))
	inventory.unequip_requested.connect(func(instance_id: String) -> void: unequip_item_requested.emit(instance_id))
	add_child(inventory)

func _shop() -> void:
	var panel = ShopPanelScript.new()
	panel.position = Vector2(40.0, 1140.0)
	panel.size = Vector2(1000.0, 245.0)
	panel.set_catalog(_shop_catalog())
	panel.set_purchase_context(int(_view.get("gold", 0)), Array(_view.get("bench", [])).size(), _prepare_enabled, int(_view.get("freeRefreshes", 0)))
	panel.bind_shop(Array(_view.get("shop", [])), Dictionary(_view.get("shopOdds", {})), bool(_view.get("shopLocked", false)))
	panel.buy_shop_slot.connect(func(index: int) -> void: buy_shop_slot.emit(index))
	panel.refresh_shop.connect(func() -> void: refresh_shop.emit())
	panel.lock_shop.connect(func() -> void: lock_shop.emit())
	add_child(panel)

func _action_rail() -> void:
	_panel("ActionRail", Rect2(40.0, 1405.0, 1000.0, 125.0), ThemeTokensScript.STONE_RAISED)
	_label("ActionHeading", "ROUND ACTIONS", Rect2(64.0, 1415.0, 300.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var xp := _button("BuyXp", "Buy 4 XP", Rect2(60.0, 1460.0, 170.0, 56.0), ThemeTokensScript.PLAYER)
	xp.disabled = not _prepare_enabled or int(_view.get("gold", 0)) < 4 or int(_view.get("experienceToNext", 0)) <= 0
	xp.pressed.connect(func() -> void: buy_xp.emit())
	var start := _button("StartRound", "Start Round", Rect2(250.0, 1460.0, 170.0, 56.0), ThemeTokensScript.SUCCESS)
	start.disabled = not _prepare_enabled or _deployed_count() == 0
	start.pressed.connect(func() -> void: start_round.emit())
	var sell := _button("SellSelected", "Sell selected", Rect2(440.0, 1460.0, 180.0, 56.0), ThemeTokensScript.DANGER)
	sell.disabled = not _prepare_enabled or _selected_hero_instance_id.is_empty()
	sell.pressed.connect(_request_sell_selected)
	var collection := _button("ViewCollection", "Collection", Rect2(640.0, 1460.0, 180.0, 56.0), ThemeTokensScript.GOLD)
	collection.disabled = not _prepare_enabled
	collection.pressed.connect(func() -> void: collection_requested.emit())
	_label("SellFeedback", _sell_feedback, Rect2(64.0, 1512.0, 920.0, 18.0), 14, ThemeTokensScript.MUTED)

func _panel(node_name: String, rect: Rect2, color: Color = ThemeTokensScript.STONE) -> Panel:
	var panel := Panel.new()
	panel.name = node_name
	panel.position = rect.position
	panel.size = rect.size
	panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(color))
	add_child(panel)
	return panel

func _label(node_name: String, text: String, rect: Rect2, font_size: int, color: Color, wrap: bool = false) -> Label:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)
	return label

func _button(node_name: String, text: String, rect: Rect2, accent: Color) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = text
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_ALL
	button.tooltip_text = text.replace("\n", " ")
	ThemeTokensScript.apply_button_style(button, accent)
	add_child(button)
	return button

func _formation_slot(node_name: String, label_text: String, rect: Rect2, accent: Color, hero_instance_id: String, destination: int) -> FormationSlotButton:
	var button := FormationSlotButtonScript.new()
	button.name = node_name
	button.text = label_text
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_ALL
	button.tooltip_text = label_text.replace("\n", " ")
	ThemeTokensScript.apply_button_style(button, accent)
	button.configure_slot(hero_instance_id, destination, _prepare_enabled)
	add_child(button)
	return button

func _emit_formation_hero(instance_id: String, destination: int) -> void:
	formation_hero_pressed.emit(instance_id, destination)

func _emit_formation_destination(destination: int) -> void:
	formation_destination_selected.emit(destination)

func _request_sell_selected() -> void:
	_sell_feedback = "Sell requested; awaiting server confirmation."
	var feedback: Label = find_child("SellFeedback", true, false) as Label
	if feedback != null:
		feedback.text = _sell_feedback
	sell_hero.emit(_selected_hero_instance_id)

func _deployed_count() -> int:
	return Array(_view.get("board", [])).filter(func(hero): return hero != null).size()

func _hero_name(hero: Dictionary) -> String:
	var hero_id := String(hero.get("heroId", "?"))
	if HeroVisualCatalogScript.hero_ids().has(hero_id):
		return String(HeroVisualCatalogScript.profile(hero_id).get("display_name", hero_id))
	return hero_id

func _hero_catalog() -> Dictionary:
	var catalog := {}
	for hero_id in HeroVisualCatalogScript.hero_ids():
		catalog[hero_id] = HeroVisualCatalogScript.profile(hero_id)
	return catalog

func _heroes_for_inventory() -> Array:
	var heroes: Array = Array(_view.get("bench", [])).duplicate(true)
	for hero in Array(_view.get("board", [])):
		if hero != null:
			heroes.append(hero)
	return heroes

func _star_upgrade_presentation() -> void:
	if _star_upgrade.is_empty():
		return
	var panel := Panel.new()
	panel.name = "StarUpgradePresentation"
	panel.position = Vector2(565.0, 182.0)
	panel.size = Vector2(450.0, 46.0)
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.GOLD))
	add_child(panel)
	var label := Label.new()
	label.name = "StarUpgradeMessage"
	label.text = "Three copies combined — %s is now %d star%s" % [String(_star_upgrade.get("heroName", "Hero")), int(_star_upgrade.get("stars", 2)), "s" if int(_star_upgrade.get("stars", 2)) != 1 else ""]
	label.position = Vector2(12.0, 8.0)
	label.size = Vector2(426.0, 32.0)
	label.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_META)
	label.add_theme_color_override("font_color", ThemeTokensScript.INK)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	panel.add_child(label)
	if not _reduced_motion:
		var pulse := ColorRect.new()
		pulse.name = "StarUpgradePulse"
		pulse.color = Color(ThemeTokensScript.PARCHMENT, 0.28)
		pulse.position = Vector2(4.0, 4.0)
		pulse.size = panel.size - Vector2(8.0, 8.0)
		pulse.mouse_filter = Control.MOUSE_FILTER_IGNORE
		panel.add_child(pulse)
		var tween := create_tween()
		tween.tween_property(pulse, "modulate:a", 0.15, ThemeTokensScript.motion_duration(0.18, false))
		tween.tween_property(pulse, "modulate:a", 1.0, ThemeTokensScript.motion_duration(0.18, false))

func _shop_catalog() -> Dictionary:
	var catalog := {}
	for hero_id in HeroVisualCatalogScript.hero_ids():
		catalog[hero_id] = HeroVisualCatalogScript.profile(hero_id)
	return catalog
