extends SceneTree

const LOADER_PATH := "res://scripts/replay_loader.gd"

func _init() -> void:
	var loader_script := load(LOADER_PATH)
	if loader_script == null:
		_fail("ReplayLoader script is missing")
		return

	var events = loader_script.load_events("res://fixtures/combat-replay.json")
	if events.size() != 15:
		_fail("fixture must expose every event")
		return
	var spawn_positions := {}
	for event in events:
		if event.type == "UNIT_SPAWNED":
			spawn_positions[event.source_unit_id] = int(event.payload.get("position", -1))
	_expect(spawn_positions == {
		"enemy:H15:1": 1,
		"enemy:H16:1": 3,
		"enemy:H17:1": 7,
		"enemy:H19:1": 5,
		"player:H01:1": 18,
		"player:H02:1": 19,
		"player:H03:1": 20,
		"player:H04:1": 22,
	}, "fixture must map each demo hero to its tactical board position")
	_expect(events[0].tick == 0 and events[0].type == "COMBAT_STARTED", "first event must start combat")
	_expect(events[12].type == "DAMAGE_APPLIED", "fixture must exercise HP updates")
	_expect(events[14].type == "COMBAT_ENDED", "last event must end combat")
	print("PASS replay_loader_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
