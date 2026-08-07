extends SceneTree

const CombatScreenScript = preload("res://scripts/screens/match/combat_screen.gd")
const AdventureControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	var screen = CombatScreenScript.new()
	get_root().add_child(screen)
	var controller = AdventureControllerScript.new()
	get_root().add_child(controller)
	var port = RuntimePortScript.new()
	var requests: Array = []
	port.request_submitted.connect(func(request: Dictionary) -> void: requests.append(request))
	controller.set_command_id_provider_for_test(func(command_type: String) -> String: return "test:%s" % command_type.to_lower())
	screen.attach_controller(controller)
	controller.attach_runtime_port(port)

	screen.bind({ "phase": "COMBAT", "round": 1 })
	var header := screen.get_node("Root/Header") as Label
	_expect(header.text.begins_with("Combat | phase=COMBAT"), "the combat screen must render the live phase while combat resolves")

	_expect(port.accept_response({
		"revision": 1, "replayed": false,
		"view": {
			"id": "combat-screen-run", "revision": 1, "phase": "PLAYBACK", "round": 1,
			"gold": 0, "health": 30, "board": [], "bench": [], "shop": [],
			"actions": { "ackPlaybackComplete": { "allowed": true } },
		},
	}), "the runtime port must accept the PLAYBACK view driving this fixture")

	screen.on_playback_ready({
		"combatId": "combat:screen-fixture:1:0",
		"tickRate": 20,
		"maxTicks": 40,
		"events": [
			{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED", "payload": {} },
			{ "sequence": 1, "tick": 0, "type": "UNIT_SPAWNED", "payload": { "unitId": "p1", "side": "player", "hp": 30, "position": 16 } },
			{ "sequence": 2, "tick": 0, "type": "UNIT_SPAWNED", "payload": { "unitId": "e1", "side": "enemy", "hp": 10, "position": 0 } },
			{ "sequence": 3, "tick": 5, "type": "DAMAGE_APPLIED", "sourceUnitId": "p1", "targetUnitId": "e1", "payload": { "amount": 10, "remainingHp": 0 } },
			{ "sequence": 4, "tick": 5, "type": "UNIT_DIED", "targetUnitId": "e1", "payload": { "unitId": "e1", "killerId": "p1" } },
			{ "sequence": 5, "tick": 5, "type": "COMBAT_ENDED", "payload": { "winner": "player" } },
		],
	})
	screen.bind({ "phase": "PLAYBACK", "round": 1 })

	_expect(requests.is_empty(), "the screen must not ACK before the recorded playback has actually finished presenting")
	screen._process(1.0)

	var unit_list := screen.get_node("Root/UnitList") as VBoxContainer
	_expect(unit_list.get_child_count() == 2, "the unit list must render one row per unit that appeared in the playback")

	_expect(requests.size() == 1 and requests[0].type == "ACK_PLAYBACK_COMPLETE",
		"the screen must automatically ACK once the recorded playback finishes presenting")

	screen._process(1.0)
	_expect(requests.size() == 1, "the screen must not ACK twice for the same combat")

	screen.queue_free()
	controller.queue_free()
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS match_combat_screen_test")
	quit(0)
