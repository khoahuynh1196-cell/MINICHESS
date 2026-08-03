class_name HeroCard
extends Button

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

var hero_id := ""
var cost_text := ""
var rarity_text := ""
var star_text := ""
var is_unique_offer := false
var _availability_reason := ""

func _init() -> void:
	focus_mode = Control.FOCUS_ALL
	text = ""
	ThemeTokensScript.apply_button_style(self, ThemeTokensScript.GOLD)
	_build_content()

func configure(hero: Dictionary, catalog: Dictionary) -> void:
	hero_id = String(hero.get("heroId", ""))
	var profile: Dictionary = Dictionary(catalog.get(hero_id, {}))
	is_unique_offer = hero_id.begins_with("U") or bool(hero.get("isUniqueHero", false)) or bool(profile.get("is_unique_hero", false))
	var name_label := _label("HeroName")
	var faction_label := _label("FactionClass")
	var portrait := get_node("Portrait") as TextureRect
	if hero_id.is_empty():
		cost_text = ""
		rarity_text = ""
		star_text = ""
		name_label.text = "Sold"
		faction_label.text = "Offer unavailable"
		portrait.texture = null
		set_purchase_enabled(false, "This offer has already been taken.")
		return
	if is_unique_offer:
		cost_text = ""
		rarity_text = ""
		star_text = ""
		name_label.text = "Not offered"
		faction_label.text = "Unique heroes are not sold here"
		portrait.texture = null
		set_purchase_enabled(false, "Unique heroes are never shop offers.")
		return
	var cost := int(hero.get("cost", 0))
	var rarity := int(hero.get("rarity", cost))
	cost_text = "%d Gold" % cost
	rarity_text = "Tier %d" % rarity
	star_text = "★".repeat(maxi(rarity, 0))
	name_label.text = String(profile.get("display_name", hero_id))
	faction_label.text = "%s  /  %s" % [String(profile.get("species", "Unknown")), String(profile.get("role", "Unknown"))]
	_label("Cost").text = cost_text
	_label("Rarity").text = rarity_text
	_label("Stars").text = star_text
	_load_portrait(portrait, String(profile.get("source_sprite", "")))
	set_purchase_enabled(true)

func set_purchase_enabled(available: bool, reason: String = "") -> void:
	_availability_reason = reason
	disabled = not available or is_unique_offer
	tooltip_text = _tooltip_text()

func _build_content() -> void:
	var portrait := TextureRect.new()
	portrait.name = "Portrait"
	portrait.position = Vector2(12.0, 14.0)
	portrait.size = Vector2(58.0, 72.0)
	portrait.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	portrait.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	portrait.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(portrait)
	_add_label("HeroName", Rect2(76.0, 12.0, 94.0, 24.0), 17, ThemeTokensScript.INK)
	_add_label("FactionClass", Rect2(76.0, 42.0, 94.0, 20.0), 13, ThemeTokensScript.INK)
	_add_label("Cost", Rect2(12.0, 88.0, 76.0, 24.0), 16, ThemeTokensScript.INK)
	_add_label("Rarity", Rect2(88.0, 88.0, 80.0, 24.0), 16, ThemeTokensScript.INK)
	_add_label("Stars", Rect2(12.0, 112.0, 156.0, 22.0), 15, ThemeTokensScript.INK)

func _add_label(node_name: String, rect: Rect2, font_size: int, color: Color, wrap: bool = false) -> void:
	var label := Label.new()
	label.name = node_name
	label.position = rect.position
	label.size = rect.size
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART if wrap else TextServer.AUTOWRAP_OFF
	label.clip_text = not wrap
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)

func _label(node_name: String) -> Label:
	return get_node(node_name) as Label

func _load_portrait(portrait: TextureRect, sprite_name: String) -> void:
	var path := "res://assets/sprites/%s" % sprite_name
	portrait.texture = load(path) as Texture2D if not sprite_name.is_empty() and ResourceLoader.exists(path) else null

func _tooltip_text() -> String:
	if not _availability_reason.is_empty():
		return _availability_reason
	return "%s — %s, %s" % [hero_id, cost_text, rarity_text]
