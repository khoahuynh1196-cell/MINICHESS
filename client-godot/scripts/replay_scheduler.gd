class_name ReplayScheduler
extends RefCounted

const TICKS_PER_SECOND := 20

var _events: Array = []
var _next_index := 0
var _elapsed_ticks := 0
var _fractional_ticks := 0.0

func _init(events: Array) -> void:
	_events = events.duplicate()
	_events.sort_custom(func(left, right) -> bool:
		if left.tick != right.tick:
			return left.tick < right.tick
		return left.sequence < right.sequence
	)

func advance(delta_seconds: float) -> Array:
	_fractional_ticks += delta_seconds * TICKS_PER_SECOND
	var whole_ticks := int(floor(_fractional_ticks + 0.000001))
	_fractional_ticks -= whole_ticks
	_elapsed_ticks += whole_ticks

	var due_events: Array = []
	while _next_index < _events.size() and _events[_next_index].tick <= _elapsed_ticks:
		due_events.append(_events[_next_index])
		_next_index += 1
	return due_events
