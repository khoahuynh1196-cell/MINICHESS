class_name ScreenRouter
extends CanvasLayer

const SCREEN_IDS := ["lobby", "map", "prepare", "combat", "reward", "recap", "collection", "settings"]

var current_screen_id := ""
var _screens: Dictionary = {}

func _init() -> void:
	for screen_id in SCREEN_IDS:
		var screen := Control.new()
		screen.name = "%s_screen" % screen_id
		screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		screen.visible = false
		add_child(screen)
		_screens[screen_id] = screen

func show_screen(screen_id: String) -> bool:
	if not _screens.has(screen_id):
		return false
	for candidate in _screens.values():
		candidate.visible = false
	var next: Control = _screens[screen_id]
	next.visible = true
	current_screen_id = screen_id
	return true

func screen_root(screen_id: String) -> Control:
	return _screens.get(screen_id)

func visible_screen_count() -> int:
	var count := 0
	for screen in _screens.values():
		if screen.visible:
			count += 1
	return count
