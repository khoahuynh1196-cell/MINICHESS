class_name ThemeTokens
extends RefCounted

# Semantic tokens keep the mobile UI independent from one-off presentation colors.
const PORTRAIT_WIDTH := 1080.0
const PORTRAIT_HEIGHT := 1920.0
const SCREEN_MARGIN := 40.0
const SAFE_TOP := 150.0
const SAFE_BOTTOM := 80.0
const CONTENT_BOUNDS := Rect2(SCREEN_MARGIN, SAFE_TOP, PORTRAIT_WIDTH - SCREEN_MARGIN * 2.0, PORTRAIT_HEIGHT - SAFE_TOP - SAFE_BOTTOM)
const NAVY := Color("#111a2d")
const ABYSS := Color("#080d18")
const STONE := Color("#263247")
const STONE_RAISED := Color("#34445c")
const BOARD_DARK := Color("#172338")
const BOARD_PLAYER := Color("#1d5965")
const BOARD_ENEMY := Color("#5c2d3a")
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
const TYPE_TITLE := 38
const TYPE_SECTION := 26
const TYPE_BODY := 24
const TYPE_META := 20

static func rarity_color(tier: int) -> Color:
	match clampi(tier, 1, 5):
		1: return Color("#aeb9c8")
		2: return Color("#6ed08a")
		3: return Color("#65a9ff")
		4: return Color("#c77dff")
		_: return GOLD

static func font_size(role: String) -> int:
	match role:
		"title": return TYPE_TITLE
		"section": return TYPE_SECTION
		"body": return TYPE_BODY
		_: return TYPE_META

static func motion_duration(seconds: float, reduced_motion: bool) -> float:
	return 0.0 if reduced_motion else seconds

static func clamp_to_content_bounds(rect: Rect2) -> Rect2:
	return rect.intersection(CONTENT_BOUNDS)

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

static func arena_tile_style(side: String, occupied: bool, selected: bool = false) -> StyleBoxFlat:
	var base := BOARD_PLAYER if side == "player" else BOARD_ENEMY if side == "enemy" else BOARD_DARK
	var style := StyleBoxFlat.new()
	style.bg_color = Color(base, 0.92 if occupied else 0.52)
	style.corner_radius_top_left = 14
	style.corner_radius_top_right = 14
	style.corner_radius_bottom_left = 14
	style.corner_radius_bottom_right = 14
	style.border_width_left = 3 if selected else 2
	style.border_width_right = 3 if selected else 2
	style.border_width_top = 3 if selected else 2
	style.border_width_bottom = 3 if selected else 2
	style.border_color = GOLD if selected else Color(PLAYER if side == "player" else ENEMY, 0.9 if occupied else 0.45)
	style.shadow_color = Color(ABYSS, 0.48)
	style.shadow_size = 7
	style.shadow_offset = Vector2(0, 4)
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
