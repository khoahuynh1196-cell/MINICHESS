extends SceneTree

const ScreenRouterScript = preload("res://scripts/ui/screen_router.gd")

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
	var current_screen: String = router.current_screen_id
	_expect(not router.show_screen("unknown"), "router must reject an unknown screen ID")
	_expect(router.current_screen_id == current_screen, "an unknown screen must not replace the current screen")
	_expect(router.visible_screen_count() == 1, "an unknown screen must preserve the visible root")
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
