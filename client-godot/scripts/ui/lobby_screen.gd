class_name LobbyScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

signal start_pve_requested
signal continue_requested
signal collection_requested
signal settings_requested
signal online_requested

var _continue_available := false

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_rebuild()

func set_continue_available(available: bool) -> void:
	_continue_available = available
	var continue_button: Button = find_child("ContinueRun", true, false)
	if continue_button != null:
		continue_button.disabled = not available

func _rebuild() -> void:
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var title := Label.new()
	title.text = "EXPEDITION LOBBY"
	title.position = Vector2(ThemeTokensScript.SCREEN_MARGIN, 82.0)
	title.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	title.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	add_child(title)
	var hero := _panel(Rect2(40.0, 180.0, 1000.0, 570.0), "A small world, one brave eight-round climb")
	var description := Label.new()
	description.text = "Build a party of original chibi champions. Every battle is replayed from an authoritative deterministic result."
	description.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	description.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	description.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	hero.add_child(description)
	hero.add_child(_button("Start PvE Expedition", func() -> void: start_pve_requested.emit(), ThemeTokensScript.GOLD, "StartPve"))
	var continue_button := _button("Continue Saved Run", func() -> void: continue_requested.emit(), ThemeTokensScript.PLAYER, "ContinueRun")
	continue_button.disabled = not _continue_available
	hero.add_child(continue_button)
	var navigation := _panel(Rect2(40.0, 790.0, 1000.0, 250.0), "Explore")
	navigation.add_child(_button("Collection", func() -> void: collection_requested.emit(), ThemeTokensScript.STONE_RAISED, "Collection"))
	navigation.add_child(_button("Comfort & Accessibility", func() -> void: settings_requested.emit(), ThemeTokensScript.STONE_RAISED, "Settings"))
	navigation.add_child(_button("Online PvP · 8 Players", func() -> void: online_requested.emit(), ThemeTokensScript.PLAYER, "OnlinePvp"))

func _panel(rect: Rect2, heading: String) -> VBoxContainer:
	var panel := PanelContainer.new()
	var safe_rect := ThemeTokensScript.clamp_to_content_bounds(rect)
	panel.position = safe_rect.position
	panel.size = safe_rect.size
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	add_child(panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(content)
	var label := Label.new()
	label.text = heading
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	label.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	content.add_child(label)
	return content

func _button(label: String, action: Callable, accent: Color, node_name: String) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	button.pressed.connect(action)
	return button
