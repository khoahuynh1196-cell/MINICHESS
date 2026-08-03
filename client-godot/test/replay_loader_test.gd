extends SceneTree

const LOADER_PATH := "res://scripts/replay_loader.gd"

func _init() -> void:
	var loader_script := load(LOADER_PATH)
	if loader_script == null:
		_fail("ReplayLoader script is missing")
		return

	var events = loader_script.load_events("res://fixtures/combat-replay.json")
	if events.size() != 8:
		_fail("fixture must expose every event")
		return
	_expect(events[0].tick == 0 and events[0].type == "COMBAT_STARTED", "first event must start combat")
	_expect(events[6].type == "DAMAGE_APPLIED", "fixture must exercise HP updates")
	_expect(events[7].type == "COMBAT_ENDED", "last event must end combat")
	print("PASS replay_loader_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
