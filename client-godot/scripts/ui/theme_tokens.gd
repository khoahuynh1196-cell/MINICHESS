class_name ThemeTokens
extends RefCounted

# Semantic tokens keep the mobile UI independent from one-off presentation colors.
const NAVY := Color("#111a2d")
const STONE := Color("#263247")
const STONE_RAISED := Color("#34445c")
const PARCHMENT := Color("#f5ead2")
const INK := Color("#1c2536")
const GOLD := Color("#e8b85b")
const PLAYER := Color("#56c7c9")
const ENEMY := Color("#ec806d")
const SUCCESS := Color("#9dcc75")
const DANGER := Color("#e36f67")
const MUTED := Color("#a8b1c0")
const PANEL_RADIUS := 18
const TOUCH_TARGET := 44
const TOUCH_GAP := 8

static func panel_style(color: Color = STONE) -> StyleBoxFlat:
	var style := StyleBoxFlat.new()
	style.bg_color = color
	style.corner_radius_top_left = PANEL_RADIUS
	style.corner_radius_top_right = PANEL_RADIUS
	style.corner_radius_bottom_left = PANEL_RADIUS
	style.corner_radius_bottom_right = PANEL_RADIUS
	style.border_width_left = 2
	style.border_width_right = 2
	style.border_width_top = 2
	style.border_width_bottom = 2
	style.border_color = Color(PARCHMENT, 0.16)
	style.content_margin_left = 16
	style.content_margin_right = 16
	style.content_margin_top = 12
	style.content_margin_bottom = 12
	return style

static func apply_button_style(button: Button, accent: Color = GOLD) -> void:
	button.custom_minimum_size.y = TOUCH_TARGET
	button.add_theme_font_size_override("font_size", 22)
	button.add_theme_color_override("font_color", INK)
	button.add_theme_color_override("font_hover_color", INK)
	button.add_theme_color_override("font_pressed_color", INK)
	var normal := panel_style(accent)
	var hover := panel_style(accent.lightened(0.1))
	var pressed := panel_style(accent.darkened(0.12))
	button.add_theme_stylebox_override("normal", normal)
	button.add_theme_stylebox_override("hover", hover)
	button.add_theme_stylebox_override("pressed", pressed)
	button.add_theme_stylebox_override("disabled", panel_style(STONE_RAISED))
	button.add_theme_color_override("font_disabled_color", MUTED)
