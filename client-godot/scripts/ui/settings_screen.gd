class_name SettingsScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const SettingsStoreScript = preload("res://scripts/ui/settings_store.gd")
const LocalizationCatalogScript = preload("res://scripts/localization_catalog.gd")

signal settings_changed(settings: Dictionary)
signal language_requested
signal text_scale_requested
signal clear_saved_run_requested
signal back_requested

var _store = SettingsStoreScript.new()
var _settings: Dictionary = SettingsStoreScript.DEFAULTS.duplicate(true)
var _localization = LocalizationCatalogScript.new()

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_rebuild()

func set_settings(settings: Dictionary) -> void:
	_settings = SettingsStoreScript.DEFAULTS.duplicate(true)
	for option in SettingsStoreScript.DEFAULTS:
		if settings.has(option) and typeof(settings[option]) == typeof(SettingsStoreScript.DEFAULTS[option]):
			_settings[option] = settings[option]
	_localization.set_locale(String(_settings.get("language", "en")))
	_rebuild()

func set_locale(locale: String) -> void:
	_localization.set_locale(locale)
	_rebuild()

func set_toggle(option: String, enabled: bool) -> void:
	if not SettingsStoreScript.DEFAULTS.has(option) or typeof(SettingsStoreScript.DEFAULTS[option]) != TYPE_BOOL:
		return
	_settings[option] = enabled
	_store.save_settings(_settings)
	settings_changed.emit(_settings.duplicate(true))
	var toggle: CheckButton = find_child("Toggle_%s" % option, true, false)
	if toggle != null:
		toggle.button_pressed = enabled

func _rebuild() -> void:
	for child in get_children():
		child.free()
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var title := Label.new()
	title.name = "SettingsTitle"
	title.text = _text("settings.title")
	title.position = Vector2(ThemeTokensScript.SCREEN_MARGIN, 82.0)
	title.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	title.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	add_child(title)
	var panel := PanelContainer.new()
	var rect := ThemeTokensScript.clamp_to_content_bounds(Rect2(40.0, 165.0, 1000.0, 820.0))
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	add_child(panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(content)
	var heading := Label.new()
	heading.name = "SettingsHeading"
	heading.text = _text("settings.comfort_controls")
	heading.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	heading.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	content.add_child(heading)
	for option in ["sound", "music", "haptics", "reduced_motion"]:
		var toggle := CheckButton.new()
		toggle.name = "Toggle_%s" % option
		toggle.text = _text("settings.%s" % option)
		toggle.button_pressed = bool(_settings.get(option, false))
		toggle.custom_minimum_size.y = ThemeTokensScript.TOUCH_TARGET
		toggle.focus_mode = Control.FOCUS_ALL
		toggle.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
		toggle.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		toggle.toggled.connect(func(value: bool) -> void: set_toggle(option, value))
		content.add_child(toggle)
	content.add_child(_button(_text("settings.language", { "language": _text("language.%s" % String(_settings.get("language", "en"))) }), func() -> void: language_requested.emit(), ThemeTokensScript.PLAYER, "Language"))
	content.add_child(_button(_text("settings.text_scale", { "percent": int(float(_settings.get("text_scale", 1.0)) * 100.0) }), func() -> void: text_scale_requested.emit(), ThemeTokensScript.PLAYER, "TextScale"))
	content.add_child(_button(_text("settings.clear_saved_run"), func() -> void: clear_saved_run_requested.emit(), ThemeTokensScript.DANGER, "ClearRun"))
	content.add_child(_button(_text("settings.back"), func() -> void: back_requested.emit(), ThemeTokensScript.GOLD, "Back"))

func _text(key: String, variables: Dictionary = {}) -> String:
	return _localization.text(key, variables)

func _button(label: String, action: Callable, accent: Color, node_name: String) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	button.pressed.connect(action)
	return button
