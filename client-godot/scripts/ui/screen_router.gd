class_name ScreenRouter
extends CanvasLayer

const SCREEN_IDS := ["lobby", "map", "prepare", "combat", "reward", "recap", "collection", "settings"]
const LobbyScreenScript = preload("res://scripts/ui/lobby_screen.gd")
const EncounterMapScreenScript = preload("res://scripts/ui/encounter_map_screen.gd")
const SettingsScreenScript = preload("res://scripts/ui/settings_screen.gd")

var current_screen_id := ""
var _screens: Dictionary = {}
var lobby_screen
var encounter_map_screen
var settings_screen

func _init() -> void:
	layer = 10
	for screen_id in SCREEN_IDS:
		var screen: Control = _create_screen(screen_id)
		screen.name = "%s_screen" % screen_id
		screen.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		screen.clip_contents = true
		screen.mouse_filter = Control.MOUSE_FILTER_STOP
		screen.visible = false
		add_child(screen)
		_screens[screen_id] = screen
	show_screen("lobby")

func _create_screen(screen_id: String) -> Control:
	match screen_id:
		"lobby":
			lobby_screen = LobbyScreenScript.new()
			return lobby_screen
		"map":
			encounter_map_screen = EncounterMapScreenScript.new()
			return encounter_map_screen
		"settings":
			settings_screen = SettingsScreenScript.new()
			return settings_screen
		_:
			return Control.new()

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
