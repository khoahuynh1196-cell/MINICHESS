extends SceneTree

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

var _failed := false

func _init() -> void:
	var collection_screen_script = load("res://scripts/ui/collection_screen.gd")
	_expect(collection_screen_script != null, "CollectionScreen must exist to show content-authoritative profiles")
	if collection_screen_script == null:
		_finish()
		return
	var screen = collection_screen_script.new()
	screen.bind_collection()
	_expect(screen.visible_hero_ids().size() == 20, "collection must expose all current roster heroes")
	_expect(screen.visible_hero_ids().all(func(id: String) -> bool: return id.begins_with("H")), "collection must not create future Unique heroes")
	var first_card: Button = screen.find_child("HeroCard_H01", true, false) as Button
	_expect(first_card != null and first_card.get_theme_color("font_color").is_equal_approx(ThemeTokensScript.PARCHMENT), "dark collection cards must use high-contrast parchment text")
	screen.set_filters("cat", "mage")
	_expect(screen.visible_hero_ids() == ["H04"], "collection filters must intersect species and class")
	screen.set_filters("unknown", "unknown")
	_expect(screen.visible_hero_ids().size() == 20, "invalid filters must safely reset to all profiles")
	screen.open_hero_detail("H04")
	_expect(screen.detail_hero_id() == "H04" and screen.find_child("HeroDetailModal", true, false) != null, "a profile card must open a detail modal")
	_expect(screen.unique_item_ids() == ["U01", "U02", "U03", "U04", "U05", "U06"], "the collection must include the six existing Unique-item codex entries")
	_expect(screen.find_child("UniqueHero", true, false) == null, "the collection must defer future Unique heroes")
	screen.free()
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS collection_screen_test")
	quit(0)
