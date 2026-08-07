extends SceneTree

const CombatTimelineScript = preload("res://scripts/presentation/combat_timeline.gd")

var _failed := false

func _init() -> void:
	var playback := {
		"tickRate": 20,
		"maxTicks": 100,
		"events": [
			{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED", "payload": {} },
			{ "sequence": 1, "tick": 10, "type": "ATTACK_STARTED", "payload": {} },
			{ "sequence": 2, "tick": 10, "type": "DAMAGE_APPLIED", "payload": {} },
			{ "sequence": 3, "tick": 40, "type": "COMBAT_ENDED", "payload": {} },
		],
	}
	var timeline = CombatTimelineScript.new(playback)
	_expect(timeline.tick_rate == 20 and timeline.max_ticks == 100, "timeline must read tickRate/maxTicks from the real playback, not a hardcoded constant")

	# tick 0 (COMBAT_STARTED) is due immediately; at 20 ticks/sec, 0.4s = 8
	# ticks, so the tick-10 events must not fire yet.
	var due := timeline.advance(0.4)
	_expect(due.size() == 1 and due[0]["type"] == "COMBAT_STARTED", "only the tick-0 event may fire before tick 10 is reached")
	_expect(timeline.elapsed_ticks() == 8, "elapsed ticks must track fractional accumulation")

	# Another 0.1s brings us to tick 10 exactly: both same-tick events must
	# fire together, in their original sequence order.
	due = timeline.advance(0.1)
	_expect(due.size() == 2 and due[0]["type"] == "ATTACK_STARTED" and due[1]["type"] == "DAMAGE_APPLIED",
		"same-tick events must fire together in authoritative sequence order")

	_expect(not timeline.is_finished(), "timeline must not report finished before COMBAT_ENDED is reached")

	# 2x speed must reach the same events, just sooner in wall-clock time --
	# never a different set or a different order. 0.5s at 20 ticks/sec * 2x
	# = 20 ticks, reaching every event up to and including tick 10.
	var fast = CombatTimelineScript.new(playback)
	fast.set_speed_multiplier(2.0)
	var fast_due := fast.advance(0.5)
	_expect(fast_due.size() == 3, "a faster speed multiplier must still reach every due event, just sooner in wall-clock time")

	var skipped := timeline.skip_to_end()
	_expect(skipped.size() == 1 and skipped[0]["type"] == "COMBAT_ENDED", "skip_to_end must return every remaining event")
	_expect(timeline.is_finished(), "timeline must report finished after skip_to_end")

	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS combat_timeline_test")
	quit(0)
