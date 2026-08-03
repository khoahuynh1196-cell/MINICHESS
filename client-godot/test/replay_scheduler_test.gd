extends SceneTree

const SCHEDULER_PATH := "res://scripts/replay_scheduler.gd"
const CombatEventScript = preload("res://scripts/combat_event.gd")

func _init() -> void:
	var scheduler_script := load(SCHEDULER_PATH)
	if scheduler_script == null:
		_fail("ReplayScheduler script is missing")
		return

	var scheduler = scheduler_script.new([
		_event(2, 1),
		_event(2, 0),
		_event(3, 2),
	])
	var first_due = scheduler.advance(0.05)
	_expect(first_due.size() == 0, "events must not release before tick 2")
	var same_tick_events = scheduler.advance(0.05)
	_expect(
		same_tick_events.map(func(event) -> int: return event.sequence) == [0, 1],
		"same-tick events must release by ascending sequence",
	)
	_expect(scheduler.advance(0.05).map(func(event) -> int: return event.sequence) == [2], "later event must wait")
	print("PASS replay_scheduler_test")
	quit(0)

func _event(tick: int, sequence: int):
	return CombatEventScript.from_dictionary({
		"sequence": sequence,
		"tick": tick,
		"type": "UNIT_MOVED",
		"payload": {},
	})

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	push_error(message)
	quit(1)
