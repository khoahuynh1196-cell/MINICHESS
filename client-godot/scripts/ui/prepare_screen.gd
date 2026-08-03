class_name PrepareScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const TraitSummaryScript = preload("res://scripts/ui/trait_summary.gd")
const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

const PORTRAIT_RECT := Rect2(0.0, 0.0, 1080.0, 1920.0)
const BOARD_COLUMNS := 3
const BOARD_ROWS := 8
const SHOP_SLOT_COUNT := 5
const BENCH_SLOT_COUNT := 8

signal buy_shop_slot(index: int)
signal refresh_shop
signal lock_shop
signal buy_xp
signal start_round
signal sell_hero(instance_id: String)

var _view: Dictionary = {}
var _prepare_enabled := false

func _init() -> void:
	name = "PrepareScreen"
	position = PORTRAIT_RECT.position
	size = PORTRAIT_RECT.size
	mouse_filter = Control.MOUSE_FILTER_STOP

func bind_run(view: Dictionary) -> void:
	_view = view.duplicate(true)
	_prepare_enabled = String(_view.get("state", "")) == "PREPARE"
	_rebuild()

func _rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_background()
	_header()
	_board()
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
	for index in BOARD_COLUMNS * BOARD_ROWS:
		var hero = board[index] if index < board.size() else null
		var column := index % BOARD_COLUMNS
		var row := index / BOARD_COLUMNS
		var text := "Open tile"
		if hero != null:
			text = "%s  ★%d" % [_hero_name(hero), int(hero.get("stars", 1))]
		var cell := _button("BoardCell%02d" % index, text, Rect2(60.0 + column * 325.0, 230.0 + row * 56.0, 310.0, 48.0), ThemeTokensScript.STONE_RAISED if hero != null else ThemeTokensScript.PLAYER)
		cell.disabled = not _prepare_enabled

func _bench() -> void:
	_panel("BenchPanel", Rect2(40.0, 715.0, 1000.0, 150.0))
	_label("BenchHeading", "BENCH  •  %d / %d" % [Array(_view.get("bench", [])).size(), BENCH_SLOT_COUNT], Rect2(64.0, 730.0, 360.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var bench: Array = Array(_view.get("bench", []))
	for index in BENCH_SLOT_COUNT:
		var hero = bench[index] if index < bench.size() else null
		var button := _button("BenchSlot%02d" % index, "Open bench" if hero == null else "%s  •  Sell" % _hero_name(hero), Rect2(60.0 + index * 123.0, 775.0, 116.0, 58.0), ThemeTokensScript.STONE_RAISED if hero != null else ThemeTokensScript.PLAYER)
		button.disabled = not _prepare_enabled
		if hero != null:
			button.name = "SellHero%02d" % index
			button.pressed.connect(func() -> void: sell_hero.emit(String(hero.get("instanceId", ""))))

func _traits() -> void:
	_panel("TraitPanel", Rect2(40.0, 885.0, 1000.0, 95.0))
	_label("TraitHeading", "TRAITS", Rect2(64.0, 900.0, 120.0, 26.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.GOLD)
	_label("TraitValue", TraitSummaryScript.text(Array(_view.get("board", []))), Rect2(185.0, 900.0, 820.0, 54.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT, true)

func _inventory() -> void:
	_panel("InventoryPanel", Rect2(40.0, 995.0, 1000.0, 95.0))
	_label("InventoryHeading", "INVENTORY", Rect2(64.0, 1010.0, 150.0, 26.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.GOLD)
	var items: Array = Array(_view.get("items", []))
	var labels: Array[String] = []
	for item in items:
		labels.append(ItemInventoryScript.item_label(item))
	_label("InventoryValue", "Empty" if labels.is_empty() else ", ".join(labels), Rect2(220.0, 1010.0, 785.0, 54.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT, true)

func _shop() -> void:
	_panel("ShopPanel", Rect2(40.0, 1110.0, 1000.0, 245.0))
	_label("ShopHeading", "SHOP  •  five shared-pool offers", Rect2(64.0, 1125.0, 560.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var shop: Array = Array(_view.get("shop", []))
	for index in SHOP_SLOT_COUNT:
		var slot = shop[index] if index < shop.size() else null
		var text := "Sold"
		if slot != null:
			text = "%s\n%dg" % [_hero_name(slot), int(slot.get("cost", 0))]
		var card := _button("BuySlot%d" % index, text, Rect2(60.0 + index * 194.0, 1170.0, 180.0, 104.0), ThemeTokensScript.GOLD)
		card.disabled = slot == null or not _prepare_enabled or int(_view.get("gold", 0)) < int(slot.get("cost", 0)) or Array(_view.get("bench", [])).size() >= BENCH_SLOT_COUNT
		if slot != null:
			card.pressed.connect(func() -> void: buy_shop_slot.emit(index))
	var refresh_cost := "free" if int(_view.get("freeRefreshes", 0)) > 0 else "2g"
	var refresh := _button("RefreshShop", "Refresh  •  %s" % refresh_cost, Rect2(60.0, 1290.0, 240.0, 44.0), ThemeTokensScript.PLAYER)
	refresh.disabled = not _prepare_enabled or (int(_view.get("freeRefreshes", 0)) <= 0 and int(_view.get("gold", 0)) < 2)
	refresh.pressed.connect(func() -> void: refresh_shop.emit())

func _action_rail() -> void:
	_panel("ActionRail", Rect2(40.0, 1375.0, 1000.0, 145.0), ThemeTokensScript.STONE_RAISED)
	_label("ActionHeading", "ROUND ACTIONS", Rect2(64.0, 1390.0, 300.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	var xp := _button("BuyXp", "Buy 4 XP", Rect2(60.0, 1435.0, 210.0, 56.0), ThemeTokensScript.PLAYER)
	xp.disabled = not _prepare_enabled or int(_view.get("gold", 0)) < 4 or int(_view.get("experienceToNext", 0)) <= 0
	xp.pressed.connect(func() -> void: buy_xp.emit())
	var lock := _button("LockShop", "Lock Shop", Rect2(300.0, 1435.0, 210.0, 56.0), ThemeTokensScript.STONE_RAISED)
	lock.disabled = true
	lock.tooltip_text = "Shop locking is not available until the server supports it."
	lock.pressed.connect(func() -> void: lock_shop.emit())
	var start := _button("StartRound", "Start Round", Rect2(540.0, 1435.0, 210.0, 56.0), ThemeTokensScript.SUCCESS)
	start.disabled = not _prepare_enabled or _deployed_count() == 0
	start.pressed.connect(func() -> void: start_round.emit())
	var collection := _button("ViewCollection", "Collection", Rect2(780.0, 1435.0, 210.0, 56.0), ThemeTokensScript.GOLD)
	collection.disabled = not _prepare_enabled

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

func _deployed_count() -> int:
	return Array(_view.get("board", [])).filter(func(hero): return hero != null).size()

func _hero_name(hero: Dictionary) -> String:
	var hero_id := String(hero.get("heroId", "?"))
	if HeroVisualCatalogScript.hero_ids().has(hero_id):
		return String(HeroVisualCatalogScript.profile(hero_id).get("display_name", hero_id))
	return hero_id
