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
		"player:H01:1": 14,
		"player:H02:1": 15,
		"player:H03:1": 16,
		"player:H04:1": 18,
	}, "fixture must map each demo hero to its tactical board position")
	_expect(events[0].tick == 0 and events[0].type == "COMBAT_STARTED", "first event must start combat")
	_expect(events[12].type == "DAMAGE_APPLIED", "fixture must exercise HP updates")
	_expect(events[14].type == "COMBAT_ENDED", "last event must end combat")
	var legacy_path := "user://replay_loader_legacy_test.json"
	var legacy_file := FileAccess.open(legacy_path, FileAccess.WRITE)
	legacy_file.store_string(JSON.stringify({
		"schema_version": "alpha-0.3.0",
		"events": [{ "sequence": 0, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "player:legacy", "payload": { "position": 18 } }, { "sequence": 1, "tick": 1, "type": "UNIT_MOVED", "payload": { "from": 18, "to": 19 } }]
	}))
	legacy_file.close()
	var migrated = loader_script.load_events(legacy_path)
	_expect(migrated.size() == 2 and int(migrated[0].payload.get("position", -1)) == 14 and int(migrated[1].payload.get("from", -1)) == 14 and int(migrated[1].payload.get("to", -1)) == 15, "legacy 4x8 player positions must migrate to the canonical 4x6 player half")
	var rejected_path := "user://replay_loader_legacy_tail_test.json"
	var rejected_file := FileAccess.open(rejected_path, FileAccess.WRITE)
	rejected_file.store_string(JSON.stringify({ "schema_version": "alpha-0.3.0", "events": [{ "sequence": 0, "tick": 0, "type": "UNIT_SPAWNED", "payload": { "position": 15 } }] }))
	rejected_file.close()
	_expect(loader_script.load_events(rejected_path).is_empty(), "legacy 4x8 tail cells must be rejected rather than silently remapped")
	DirAccess.remove_absolute(ProjectSettings.globalize_path(legacy_path))
	DirAccess.remove_absolute(ProjectSettings.globalize_path(rejected_path))
	print("PASS replay_loader_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
