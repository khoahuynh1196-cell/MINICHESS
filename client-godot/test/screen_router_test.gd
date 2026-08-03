extends SceneTree

const ScreenRouterScript = preload("res://scripts/ui/screen_router.gd")
const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const UnitViewScript = preload("res://scripts/unit_view.gd")
const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var router = ScreenRouterScript.new()
	var screen_ids := ["lobby", "map", "prepare", "combat", "reward", "recap", "collection", "settings"]
	for screen_id in screen_ids:
		if not _expect(router.show_screen(screen_id), "router must accept %s" % screen_id):
			break
		if not _expect(router.current_screen_id == screen_id, "router must make %s current" % screen_id):
			break
		if not _expect(router.visible_screen_count() == 1, "router must show exactly one root for %s" % screen_id):
			break
		var root: Control = router.screen_root(screen_id)
		_expect(root != null and root.get_anchor(SIDE_RIGHT) == 1.0 and root.get_anchor(SIDE_BOTTOM) == 1.0, "router roots must fill the portrait canvas for %s" % screen_id)
	var current_screen: String = router.current_screen_id
	_expect(not router.show_screen("unknown"), "router must reject an unknown screen ID")
	_expect(router.current_screen_id == current_screen, "an unknown screen must not replace the current screen")
	_expect(router.visible_screen_count() == 1, "an unknown screen must preserve the visible root")
	_expect(ThemeTokensScript.CONTENT_BOUNDS.end.y <= ThemeTokensScript.PORTRAIT_HEIGHT, "theme content bounds must stay inside the portrait viewport")
	_expect(ThemeTokensScript.font_size("title") > ThemeTokensScript.font_size("body"), "theme tokens must provide a semantic type scale")
	_expect(ThemeTokensScript.motion_duration(0.2, true) == 0.0, "reduced motion must suppress transition duration")
	var controller = BattleControllerScript.new()
	var unit = UnitViewScript.new()
	controller.unit_views["test-unit"] = unit
	controller.set_reduced_motion(true)
	_expect(unit.reduced_motion, "reduced motion must update units that are already visible")
	controller.free()
	unit.free()
	router.free()
	if _failed:
		quit(1)
		return
	print("PASS screen_router_test")
	quit(0)

func _expect(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error(message)
	return condition
