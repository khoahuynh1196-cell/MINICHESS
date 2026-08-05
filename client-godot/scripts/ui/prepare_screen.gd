class_name PrepareScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const TraitPanelScript = preload("res://scripts/ui/trait_panel.gd")
const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const FormationSlotButtonScript = preload("res://scripts/ui/formation_slot_button.gd")
const ShopPanelScript = preload("res://scripts/ui/shop_panel.gd")

const PORTRAIT_RECT := Rect2(0.0, 0.0, 1080.0, 1920.0)
const BOARD_COLUMNS := 4
const BOARD_ROWS := 6
const PLAYER_BOARD_ROWS := 3
const SHOP_SLOT_COUNT := 5
const BENCH_SLOT_COUNT := 8
const BOARD_PANEL_RECT := Rect2(24.0, 140.0, 1032.0, 708.0)
const BOARD_CELL_SIZE := Vector2(216.0, 98.0)
const BOARD_CELL_STEP := Vector2(198.0, 88.0)
const BOARD_FIRST_CENTER := Vector2(243.0, 302.0)

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

func _ready() -> void:
	# Android devices using an expanded portrait viewport can be taller than the
	# design reference. Cover that extra space instead of exposing the default gray.
	var visible_height := get_viewport_rect().size.y
	if visible_height > size.y:
		size.y = visible_height
		if not _view.is_empty():
			_rebuild()

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
	background.size = size
	background.color = ThemeTokensScript.ABYSS
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	# A soft vignette keeps the tactical board legible without mascot art competing with it.
	var horizon := ColorRect.new()
	horizon.name = "ArenaVignette"
	horizon.position = Vector2(0.0, 112.0)
	horizon.size = Vector2(1080.0, 920.0)
	horizon.color = Color(0.08, 0.18, 0.23, 0.66)
	horizon.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(horizon)

func _add_board_art() -> void:
	var atlas := AtlasTexture.new()
	atlas.atlas = load("res://assets/biomes/combat-board-3x8-atlas-v2.png") as Texture2D
	atlas.region = Rect2(0.0, 0.0, 512.0, 768.0)
	var board_art := TextureRect.new()
	board_art.name = "BoardTerrain"
	board_art.texture = atlas
	board_art.position = Vector2(112.0, 190.0)
	board_art.size = Vector2(856.0, 620.0)
	board_art.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	board_art.stretch_mode = TextureRect.STRETCH_SCALE
	board_art.modulate = Color(0.88, 0.96, 0.86, 0.9)
	board_art.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(board_art)

func _board_cell_rect(row: int, column: int) -> Rect2:
	var center := BOARD_FIRST_CENTER + Vector2(column * BOARD_CELL_STEP.x, row * BOARD_CELL_STEP.y)
	center.x += 16.0 if row % 2 == 1 else 0.0
	return Rect2(center - BOARD_CELL_SIZE * 0.5, BOARD_CELL_SIZE)

func _transparent_style() -> StyleBoxEmpty:
	return StyleBoxEmpty.new()

func _add_diamond(parent: Control, tile_size: Vector2, accent: Color, occupied: bool, selected: bool) -> void:
	var center := tile_size * 0.5
	var half_width := tile_size.x * 0.48
	var half_height := tile_size.y * 0.43
	var points := PackedVector2Array([
		Vector2(center.x - half_width, center.y),
		Vector2(center.x, center.y - half_height),
		Vector2(center.x + half_width, center.y),
		Vector2(center.x, center.y + half_height),
	])
	var surface := Polygon2D.new()
	surface.name = "TileSurface"
	surface.polygon = points
	surface.color = Color(accent, 0.38 if occupied else 0.18)
	parent.add_child(surface)
	var edge := Line2D.new()
	edge.name = "TileEdge"
	edge.points = PackedVector2Array([points[0], points[1], points[2], points[3], points[0]])
	edge.width = 4.0 if selected else 2.0
	edge.default_color = ThemeTokensScript.GOLD if selected else Color(accent, 0.82 if occupied else 0.52)
	edge.antialiased = true
	parent.add_child(edge)

func _add_unit_health_bar(cell: Control, rect: Rect2) -> void:
	var track := ColorRect.new()
	track.name = "UnitHealthTrack"
	track.position = rect.position
	track.size = rect.size
	track.color = Color(ThemeTokensScript.ABYSS, 0.85)
	track.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cell.add_child(track)
	var fill := ColorRect.new()
	fill.name = "UnitHealthFill"
	fill.position = Vector2(1.0, 1.0)
	fill.size = Vector2(rect.size.x - 2.0, rect.size.y - 2.0)
	fill.color = ThemeTokensScript.SUCCESS
	fill.mouse_filter = Control.MOUSE_FILTER_IGNORE
	track.add_child(fill)

func _header() -> void:
	_panel("HeaderPanel", Rect2(24.0, 20.0, 1032.0, 104.0), Color(ThemeTokensScript.STONE_RAISED, 0.98))
	_label("PrepareTitle", "ROUND %02d  -  STAGING" % int(_view.get("round", 0)), Rect2(52.0, 39.0, 370.0, 32.0), ThemeTokensScript.TYPE_SECTION, ThemeTokensScript.GOLD)
	_label("RoundValue", "TACTICAL PREP", Rect2(52.0, 78.0, 190.0, 24.0), 16, ThemeTokensScript.MUTED)
	_label("HealthValue", "%d HP" % int(_view.get("health", 0)), Rect2(270.0, 76.0, 130.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	_label("GoldValue", "%d GOLD" % int(_view.get("gold", 0)), Rect2(430.0, 76.0, 150.0, 28.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.GOLD)
	_label("LevelValue", "LV. %d" % int(_view.get("level", 0)), Rect2(766.0, 42.0, 105.0, 26.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PLAYER)
	_label("ExperienceValue", "%d / %d XP" % [int(_view.get("experience", 0)), int(_view.get("experienceToNext", 0))], Rect2(882.0, 42.0, 130.0, 26.0), 16, ThemeTokensScript.PARCHMENT)
	_label("FormationHint", "Set formation, then launch the round.", Rect2(628.0, 77.0, 380.0, 24.0), 16, ThemeTokensScript.MUTED)

func _board() -> void:
	_panel("BoardPanel", BOARD_PANEL_RECT, Color(ThemeTokensScript.BOARD_DARK, 0.88))
	_add_board_art()
	_label("BoardHeading", "BATTLEFIELD  4 x 6" , Rect2(52.0, 157.0, 310.0, 26.0), 18, ThemeTokensScript.PARCHMENT)
	_label("DeployedCount", "%d / %d" % [_deployed_count(), int(_view.get("boardCap", 0))], Rect2(900.0, 157.0, 105.0, 26.0), 18, ThemeTokensScript.GOLD)
	_label("EnemyTerritory", "FOG OF WAR", Rect2(737.0, 196.0, 220.0, 24.0), 15, Color(ThemeTokensScript.ENEMY, 0.9))
	_label("PlayerTerritory", "YOUR FORMATION", Rect2(80.0, 696.0, 260.0, 24.0), 15, Color(ThemeTokensScript.PLAYER, 0.95))
	var divider := ColorRect.new()
	divider.name = "FrontlineDivider"
	divider.position = Vector2(154.0, 522.0)
	divider.size = Vector2(772.0, 2.0)
	divider.color = Color(ThemeTokensScript.GOLD, 0.6)
	divider.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(divider)
	var board: Array = Array(_view.get("board", []))
	for row in BOARD_ROWS:
		for column in BOARD_COLUMNS:
			var rect := _board_cell_rect(row, column)
			if row < PLAYER_BOARD_ROWS:
				_enemy_tile("EnemyCell%02d" % (row * BOARD_COLUMNS + column), rect)
				continue
			var index := (row - PLAYER_BOARD_ROWS) * BOARD_COLUMNS + column
			var hero = board[index] if index < board.size() else null
			var selected := hero != null and String(hero.get("instanceId", "")) == _selected_hero_instance_id
			var cell := _formation_slot("BoardCell%02d" % index, "", rect, ThemeTokensScript.GOLD if selected else ThemeTokensScript.PLAYER, String(hero.get("instanceId", "")) if hero != null else "", 12 + index)
			_style_board_cell(cell, hero, selected)
			cell.move_dropped.connect(func(instance_id: String, destination: int) -> void: formation_drag_dropped.emit(instance_id, destination))
			cell.item_equip_dropped.connect(func(item_instance_id: String, hero_instance_id: String) -> void: item_equip_requested.emit(item_instance_id, hero_instance_id))
			if hero == null:
				cell.pressed.connect(_emit_formation_destination.bind(12 + index))
			else:
				cell.pressed.connect(_emit_formation_hero.bind(String(hero.get("instanceId", "")), 12 + index))

func _enemy_tile(node_name: String, rect: Rect2) -> void:
	var tile := Panel.new()
	tile.name = node_name
	tile.position = rect.position
	tile.size = rect.size
	tile.add_theme_stylebox_override("panel", _transparent_style())
	tile.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(tile)
	_add_diamond(tile, rect.size, ThemeTokensScript.ENEMY, false, false)
	var mark := Label.new()
	mark.text = "?"
	mark.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	mark.vertical_alignment = VERTICAL_ALIGNMENT_BOTTOM
	mark.position = Vector2(0.0, 16.0)
	mark.size = Vector2(rect.size.x, rect.size.y - 24.0)
	mark.add_theme_font_size_override("font_size", 38)
	mark.add_theme_color_override("font_color", Color(ThemeTokensScript.ENEMY, 0.65))
	mark.mouse_filter = Control.MOUSE_FILTER_IGNORE
	tile.add_child(mark)

func _style_board_cell(cell: FormationSlotButton, hero, selected: bool) -> void:
	var occupied := hero != null
	cell.flat = true
	cell.add_theme_stylebox_override("normal", _transparent_style())
	cell.add_theme_stylebox_override("hover", _transparent_style())
	cell.add_theme_stylebox_override("pressed", _transparent_style())
	cell.add_theme_stylebox_override("disabled", _transparent_style())
	_add_diamond(cell, cell.size, ThemeTokensScript.PLAYER, occupied, selected)
	cell.tooltip_text = "Open deployment tile" if not occupied else "%s, %d star" % [_hero_name(hero), int(hero.get("stars", 1))]
	if not occupied:
		_add_cell_label(cell, "DeployLabel", "+", Rect2(0.0, 27.0, cell.size.x, 30.0), 28, Color(ThemeTokensScript.PLAYER, 0.78))
		return
	_add_cell_portrait(cell, hero, Rect2(52.0, -48.0, 112.0, 112.0))
	_add_unit_health_bar(cell, Rect2(52.0, 72.0, 112.0, 7.0))
	_add_cell_label(cell, "UnitName", _hero_name(hero), Rect2(20.0, 79.0, cell.size.x - 40.0, 18.0), 13, ThemeTokensScript.PARCHMENT, true)
	_add_cell_label(cell, "UnitStars", "*".repeat(int(hero.get("stars", 1))), Rect2(20.0, 59.0, cell.size.x - 40.0, 17.0), 15, ThemeTokensScript.GOLD)

func _style_bench_cell(cell: FormationSlotButton, hero, selected: bool) -> void:
	var occupied := hero != null
	cell.flat = true
	cell.add_theme_stylebox_override("normal", ThemeTokensScript.panel_style(Color(ThemeTokensScript.STONE_RAISED, 0.9)))
	cell.add_theme_stylebox_override("hover", ThemeTokensScript.panel_style(Color(ThemeTokensScript.PLAYER, 0.56)))
	cell.add_theme_stylebox_override("pressed", ThemeTokensScript.panel_style(Color(ThemeTokensScript.PLAYER, 0.72)))
	cell.add_theme_stylebox_override("disabled", ThemeTokensScript.panel_style(Color(ThemeTokensScript.STONE, 0.78)))
	if selected:
		cell.add_theme_stylebox_override("normal", ThemeTokensScript.panel_style(ThemeTokensScript.GOLD.darkened(0.28)))
	cell.tooltip_text = "Empty bench slot" if not occupied else "%s, %d star" % [_hero_name(hero), int(hero.get("stars", 1))]
	if not occupied:
		_add_cell_label(cell, "BenchEmpty", "+", Rect2(0.0, 18.0, cell.size.x, 32.0), 26, ThemeTokensScript.MUTED)
		return
	_add_cell_portrait(cell, hero, Rect2(26.0, -10.0, 64.0, 64.0))
	_add_cell_label(cell, "BenchName", _hero_name(hero), Rect2(8.0, 46.0, cell.size.x - 16.0, 17.0), 11, ThemeTokensScript.PARCHMENT, true)
	_add_cell_label(cell, "BenchStars", "*".repeat(int(hero.get("stars", 1))), Rect2(8.0, 5.0, cell.size.x - 16.0, 16.0), 13, ThemeTokensScript.GOLD)

func _add_cell_portrait(cell: Control, hero: Dictionary, rect: Rect2) -> void:
	var profile := HeroVisualCatalogScript.profile(String(hero.get("heroId", "")))
	var sprite_name := String(profile.get("source_sprite", ""))
	if sprite_name.is_empty():
		return
	var portrait := TextureRect.new()
	portrait.name = "UnitPortrait"
	portrait.texture = load("res://assets/sprites/%s" % sprite_name) as Texture2D
	portrait.position = rect.position
	portrait.size = rect.size
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cell.add_child(portrait)

func _add_cell_label(cell: Control, node_name: String, text: String, rect: Rect2, font_size: int, color: Color, wrap: bool = false) -> void:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER if node_name.contains("Empty") or node_name in ["DeployLabel", "UnitName", "UnitStars", "BenchName", "BenchStars"] else HORIZONTAL_ALIGNMENT_LEFT
	label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.clip_text = not wrap
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	cell.add_child(label)
func _bench() -> void:
	_panel("BenchPanel", Rect2(24.0, 864.0, 1032.0, 136.0), Color(ThemeTokensScript.STONE, 0.97))
	_label("BenchHeading", "BENCH  %d / %d" % [Array(_view.get("bench", [])).size(), BENCH_SLOT_COUNT], Rect2(52.0, 877.0, 280.0, 24.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	_label("BenchHint", "Tap a hero, then tap a highlighted tile.", Rect2(536.0, 878.0, 460.0, 22.0), 15, ThemeTokensScript.MUTED)
	var bench: Array = Array(_view.get("bench", []))
	for index in BENCH_SLOT_COUNT:
		var hero = bench[index] if index < bench.size() else null
		var selected := hero != null and String(hero.get("instanceId", "")) == _selected_hero_instance_id
		var button := _formation_slot("BenchSlot%02d" % index, "", Rect2(42.0 + index * 125.0, 912.0, 112.0, 72.0), ThemeTokensScript.GOLD if selected else ThemeTokensScript.STONE_RAISED if hero != null else ThemeTokensScript.PLAYER, String(hero.get("instanceId", "")) if hero != null else "", index)
		_style_bench_cell(button, hero, selected)
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
	trait_panel.position = Vector2(24.0, 1594.0)
	trait_panel.size = Vector2(1032.0, 220.0)
	trait_panel.bind_board_heroes(Array(_view.get("board", [])), _hero_catalog())
	add_child(trait_panel)

func _inventory() -> void:
	var inventory := ItemInventoryScript.new()
	inventory.name = "InventoryPanel"
	inventory.position = Vector2(24.0, 1326.0)
	inventory.size = Vector2(1032.0, 116.0)
	inventory.bind_inventory(Array(_view.get("items", [])), _heroes_for_inventory(), _selected_item_instance_id, _prepare_enabled, _item_feedback)
	inventory.item_selected.connect(func(instance_id: String) -> void: item_selected.emit(instance_id))
	inventory.equip_requested.connect(func(item_instance_id: String, hero_instance_id: String) -> void: item_equip_requested.emit(item_instance_id, hero_instance_id))
	inventory.unequip_requested.connect(func(instance_id: String) -> void: unequip_item_requested.emit(instance_id))
	add_child(inventory)

func _shop() -> void:
	var panel = ShopPanelScript.new()
	panel.position = Vector2(24.0, 1016.0)
	panel.size = Vector2(1032.0, 282.0)
	panel.set_catalog(_shop_catalog())
	panel.set_purchase_context(int(_view.get("gold", 0)), Array(_view.get("bench", [])).size(), _prepare_enabled, int(_view.get("freeRefreshes", 0)))
	panel.bind_shop(Array(_view.get("shop", [])), Dictionary(_view.get("shopOdds", {})), bool(_view.get("shopLocked", false)))
	panel.buy_shop_slot.connect(func(index: int) -> void: buy_shop_slot.emit(index))
	panel.refresh_shop.connect(func() -> void: refresh_shop.emit())
	panel.lock_shop.connect(func() -> void: lock_shop.emit())
	add_child(panel)

func _action_rail() -> void:
	_panel("ActionRail", Rect2(24.0, 1460.0, 1032.0, 116.0), ThemeTokensScript.STONE_RAISED)
	_label("ActionHeading", "COMMAND", Rect2(52.0, 1472.0, 180.0, 22.0), 16, ThemeTokensScript.PARCHMENT)
	var xp := _button("BuyXp", "XP +4", Rect2(52.0, 1504.0, 150.0, 54.0), ThemeTokensScript.PLAYER)
	xp.disabled = not _prepare_enabled or int(_view.get("gold", 0)) < 4 or int(_view.get("experienceToNext", 0)) <= 0
	xp.pressed.connect(func() -> void: buy_xp.emit())
	var sell := _button("SellSelected", "SELL", Rect2(218.0, 1504.0, 132.0, 54.0), ThemeTokensScript.DANGER)
	sell.disabled = not _prepare_enabled or _selected_hero_instance_id.is_empty()
	sell.pressed.connect(_request_sell_selected)
	var collection := _button("ViewCollection", "ROSTER", Rect2(366.0, 1504.0, 150.0, 54.0), ThemeTokensScript.GOLD)
	collection.disabled = not _prepare_enabled
	collection.pressed.connect(func() -> void: collection_requested.emit())
	var start := _button("StartRound", "START BATTLE", Rect2(532.0, 1500.0, 480.0, 62.0), ThemeTokensScript.SUCCESS)
	start.disabled = not _prepare_enabled or _deployed_count() == 0
	start.pressed.connect(func() -> void: start_round.emit())
	_label("SellFeedback", _sell_feedback, Rect2(52.0, 1558.0, 450.0, 16.0), 13, ThemeTokensScript.MUTED, true)
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
	return "Unknown hero"

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
