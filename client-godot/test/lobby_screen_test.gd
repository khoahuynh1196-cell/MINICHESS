extends SceneTree

const LobbyScreenPath := "res://scripts/ui/lobby_screen.gd"
const EncounterMapScreenPath := "res://scripts/ui/encounter_map_screen.gd"
const SettingsScreenPath := "res://scripts/ui/settings_screen.gd"
const SettingsStoreScript = preload("res://scripts/ui/settings_store.gd")

var _failed := false

func _init() -> void:
	# Break caught: deleting the extracted screens must make their user-visible contracts unavailable.
	var lobby_script = load(LobbyScreenPath)
	var map_script = load(EncounterMapScreenPath)
	var settings_script = load(SettingsScreenPath)
	_expect(lobby_script != null, "lobby screen must be an independently loadable component")
	_expect(map_script != null, "encounter map must be an independently loadable component")
	_expect(settings_script != null, "settings screen must be an independently loadable component")
	if lobby_script != null:
		_test_lobby(lobby_script.new())
	if map_script != null:
		_test_map(map_script.new())
	if settings_script != null:
		_test_settings(settings_script.new())
	_finish()

func _test_lobby(lobby: Control) -> void:
	lobby.set_continue_available(false)
	var continue_button: Button = lobby.find_child("ContinueRun", true, false)
	_expect(continue_button != null and continue_button.disabled, "Continue Run must be disabled without a saved run")
	lobby.set_continue_available(true)
	if continue_button != null:
		_expect(not continue_button.disabled, "Continue Run must be enabled when a saved run exists")
		_expect(continue_button.custom_minimum_size.y >= 44.0, "Continue Run must remain touch-safe")
	lobby.free()

func _test_map(map: Control) -> void:
	map.set_encounters([
		{ "name": "Meadow Skirmish" }, { "name": "Meadow Crossroads" },
		{ "name": "Ruins Ambush" }, { "name": "Ruins Gate", "marker": "MINIBOSS" },
		{ "name": "Frost Keep Affix" }, { "name": "Frost Keep Siege" },
		{ "name": "Ember March" }, { "name": "Ember Citadel", "marker": "BOSS" },
	], 1)
	_expect(map.encounter_nodes.size() == 8, "map must render exactly eight encounter nodes")
	_expect("MINIBOSS" in map.encounter_nodes[3].text and "BOSS" in map.encounter_nodes[7].text, "map must identify miniboss and boss encounters")
	_expect(map.encounter_nodes[0].custom_minimum_size.y >= 44.0, "encounter nodes must remain touch-safe")
	map.free()

func _test_settings(settings_screen: Control) -> void:
	var store = SettingsStoreScript.new()
	store.save_settings(SettingsStoreScript.DEFAULTS)
	settings_screen.set_settings(store.load_settings())
	settings_screen.set_toggle("music", false)
	_expect(not bool(store.load_settings().get("music", true)), "settings toggles must persist to the local settings store")
	store.save_settings(SettingsStoreScript.DEFAULTS)
	settings_screen.free()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS lobby_screen_test")
	quit(0)
