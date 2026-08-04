class_name CollectionScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const ItemMetadataCatalogScript = preload("res://scripts/ui/item_metadata_catalog.gd")

signal back_requested

const SPECIES := ["all", "cat", "dog", "rabbit", "cow", "exotic"]
const ROLES := ["all", "guardian", "fighter", "ranger", "mage", "support"]

var _species_filter := "all"
var _role_filter := "all"
var _detail_id := ""

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

func bind_collection() -> void:
	_rebuild()

func visible_hero_ids() -> Array[String]:
	var ids: Array[String] = []
	for hero_id in HeroVisualCatalogScript.hero_ids():
		var profile: Dictionary = HeroVisualCatalogScript.profile(hero_id)
		if _species_filter != "all" and String(profile.get("species", "")) != _species_filter:
			continue
		if _role_filter != "all" and String(profile.get("role", "")) != _role_filter:
			continue
		ids.append(hero_id)
	return ids

func set_filters(species: String, role: String) -> void:
	_species_filter = species if species in SPECIES else "all"
	_role_filter = role if role in ROLES else "all"
	_rebuild()

func open_hero_detail(hero_id: String) -> void:
	if not hero_id in visible_hero_ids():
		return
	_detail_id = hero_id
	_rebuild()

func detail_hero_id() -> String:
	return _detail_id

func unique_item_ids() -> Array[String]:
	var ids: Array[String] = []
	for index in 6:
		var item_id := "U%02d" % (index + 1)
		if not ItemMetadataCatalogScript.item_metadata(item_id).is_empty():
			ids.append(item_id)
	return ids

func _rebuild() -> void:
	for child in get_children():
		child.queue_free()
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var panel := VBoxContainer.new()
	panel.position = Vector2(40.0, 165.0)
	panel.size = Vector2(1000.0, 1550.0)
	panel.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	add_child(panel)
	var heading := Label.new()
	heading.text = "Collection — 20 current heroes"
	heading.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	heading.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	panel.add_child(heading)
	var filters := HBoxContainer.new()
	filters.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	filters.add_child(_filter_picker("Species", SPECIES, _species_filter, func(value: String) -> void: set_filters(value, _role_filter)))
	filters.add_child(_filter_picker("Class", ROLES, _role_filter, func(value: String) -> void: set_filters(_species_filter, value)))
	panel.add_child(filters)
	var cards := GridContainer.new()
	cards.columns = 2
	cards.add_theme_constant_override("h_separation", ThemeTokensScript.TOUCH_GAP)
	cards.add_theme_constant_override("v_separation", ThemeTokensScript.TOUCH_GAP)
	for hero_id in visible_hero_ids():
		var profile: Dictionary = HeroVisualCatalogScript.profile(hero_id)
		var card := _button("%s\n%s / %s" % [String(profile.get("display_name", "Unknown hero")), String(profile.get("species", "")), String(profile.get("role", ""))], ThemeTokensScript.STONE_RAISED)
		card.name = "HeroCard_%s" % hero_id
		card.tooltip_text = "%s details" % String(profile.get("display_name", "Unknown hero"))
		card.pressed.connect(open_hero_detail.bind(hero_id))
		cards.add_child(card)
	panel.add_child(cards)
	var codex := Label.new()
	codex.name = "UniqueItemCodex"
	var unique_names: Array[String] = []
	for item_id in unique_item_ids():
		unique_names.append(String(ItemMetadataCatalogScript.item_metadata(item_id).get("name", "Unknown unique item")))
	codex.text = "Unique item codex: %s" % ", ".join(unique_names)
	codex.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	codex.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	panel.add_child(codex)
	var back := _button("Back", ThemeTokensScript.GOLD)
	back.pressed.connect(func() -> void: back_requested.emit())
	panel.add_child(back)
	if not _detail_id.is_empty():
		_add_detail_modal()

func _add_detail_modal() -> void:
	var profile: Dictionary = HeroVisualCatalogScript.profile(_detail_id)
	var modal := PanelContainer.new()
	modal.name = "HeroDetailModal"
	modal.position = Vector2(100.0, 600.0)
	modal.size = Vector2(880.0, 500.0)
	modal.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.STONE))
	add_child(modal)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	modal.add_child(content)
	var title := Label.new()
	title.name = "HeroDetailTitle"
	title.text = String(profile.get("display_name", "Unknown hero"))
	title.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	title.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	content.add_child(title)
	var detail := Label.new()
	detail.text = "%s %s\nSkill: %s\nApproved art: %s" % [String(profile.get("species", "")), String(profile.get("role", "")), String(profile.get("skill_name", "")), String(profile.get("source_sprite", ""))]
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	detail.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	content.add_child(detail)
	var close := _button("Close", ThemeTokensScript.GOLD)
	close.pressed.connect(func() -> void:
		_detail_id = ""
		_rebuild()
	)
	content.add_child(close)

func _filter_picker(label: String, values: Array, selected_value: String, selected: Callable) -> OptionButton:
	var picker := OptionButton.new()
	picker.custom_minimum_size = Vector2(470.0, ThemeTokensScript.TOUCH_TARGET)
	picker.focus_mode = Control.FOCUS_ALL
	picker.tooltip_text = label
	for value in values:
		picker.add_item(String(value).capitalize())
		if value == selected_value:
			picker.select(picker.item_count - 1)
	picker.item_selected.connect(func(index: int) -> void: selected.call(String(values[index])))
	return picker

func _button(label: String, accent: Color) -> Button:
	var button := Button.new()
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	if accent == ThemeTokensScript.STONE_RAISED:
		button.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		button.add_theme_color_override("font_hover_color", ThemeTokensScript.PARCHMENT)
		button.add_theme_color_override("font_pressed_color", ThemeTokensScript.PARCHMENT)
	return button
