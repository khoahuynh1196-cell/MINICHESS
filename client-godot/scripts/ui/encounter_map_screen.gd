class_name EncounterMapScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const DEFAULT_ENCOUNTERS := [
	{ "name": "Meadow Skirmish" }, { "name": "Meadow Crossroads" },
	{ "name": "Ruins Ambush" }, { "name": "Ruins Gate", "marker": "MINIBOSS" },
	{ "name": "Frost Keep Affix" }, { "name": "Frost Keep Siege" },
	{ "name": "Ember March" }, { "name": "Ember Citadel", "marker": "BOSS" },
]

signal encounter_selected(round: int)
signal back_requested

var encounter_nodes: Array[Button] = []
var _encounters: Array = DEFAULT_ENCOUNTERS.duplicate(true)
var _current_round := 1

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_rebuild()

func set_encounters(encounters: Array, current_round: int) -> void:
	_encounters = []
	for encounter in encounters:
		if _encounters.size() >= 8:
			break
		_encounters.append(encounter if encounter is Dictionary else {})
	while _encounters.size() < 8:
		_encounters.append(DEFAULT_ENCOUNTERS[_encounters.size()].duplicate(true))
	_current_round = clampi(current_round, 1, 8)
	_rebuild()

func _rebuild() -> void:
	for child in get_children():
		child.free()
	encounter_nodes.clear()
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var title := Label.new()
	title.text = "EXPEDITION MAP"
	title.position = Vector2(ThemeTokensScript.SCREEN_MARGIN, 82.0)
	title.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	title.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	add_child(title)
	var panel := PanelContainer.new()
	var rect := ThemeTokensScript.clamp_to_content_bounds(Rect2(40.0, 170.0, 1000.0, 1120.0))
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	add_child(panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(content)
	var heading := Label.new()
	heading.text = "Eight encounters"
	heading.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	heading.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	content.add_child(heading)
	var routes := GridContainer.new()
	routes.columns = 2
	routes.add_theme_constant_override("h_separation", ThemeTokensScript.TOUCH_GAP)
	routes.add_theme_constant_override("v_separation", ThemeTokensScript.TOUCH_GAP)
	content.add_child(routes)
	for index in 8:
		var encounter: Dictionary = _encounters[index]
		var marker := String(encounter.get("marker", "")).to_upper()
		var label := "%d  %s%s" % [index + 1, String(encounter.get("name", "Unknown encounter")), "  •  %s" % marker if not marker.is_empty() else ""]
		var node := Button.new()
		node.name = "Encounter%d" % (index + 1)
		node.text = label
		node.focus_mode = Control.FOCUS_ALL
		ThemeTokensScript.apply_button_style(node, ThemeTokensScript.GOLD if index + 1 == _current_round else ThemeTokensScript.STONE_RAISED)
		node.disabled = index + 1 != _current_round
		node.pressed.connect(func() -> void: encounter_selected.emit(index + 1))
		routes.add_child(node)
		encounter_nodes.append(node)
	var back := Button.new()
	back.name = "Back"
	back.text = "Back to Lobby"
	back.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(back, ThemeTokensScript.STONE_RAISED)
	back.pressed.connect(func() -> void: back_requested.emit())
	content.add_child(back)
