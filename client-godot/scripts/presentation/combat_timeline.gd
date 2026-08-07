class_name CombatTimeline
extends RefCounted

## Maps an authoritative AdventureCombatPlayback (game-core's
## AdventureCombatPlayback shape: combatId/snapshotHash/eventLogHash/
## tickRate/maxTicks/events) to presentation time. It never reorders or
## drops events -- the domain already guarantees contiguous sequence and
## nondecreasing tick (assertAdventureCombatPlayback), so re-sorting here
## would only risk masking a real bug instead of surfacing it.
##
## speed_multiplier changes how fast presentation time catches up to
## authoritative ticks; it never changes which events fire or their order.

var tick_rate: int
var max_ticks: int
var events: Array
var speed_multiplier := 1.0

var _elapsed_ticks := 0
var _fractional_ticks := 0.0
var _next_index := 0

func _init(playback: Dictionary) -> void:
	tick_rate = max(1, int(playback.get("tickRate", 20)))
	max_ticks = int(playback.get("maxTicks", 0))
	events = Array(playback.get("events", [])).duplicate(true)

func set_speed_multiplier(multiplier: float) -> void:
	speed_multiplier = max(0.0, multiplier)

func elapsed_ticks() -> int:
	return _elapsed_ticks

func is_finished() -> bool:
	return _next_index >= events.size()

## Advances presentation time and returns every event now due, in their
## original authoritative order. Never returns an event before its tick
## has been reached, regardless of speed_multiplier.
func advance(delta_seconds: float) -> Array:
	_fractional_ticks += delta_seconds * tick_rate * speed_multiplier
	var whole_ticks := int(floor(_fractional_ticks + 0.000001))
	_fractional_ticks -= whole_ticks
	_elapsed_ticks += whole_ticks

	var due: Array = []
	while _next_index < events.size() and int(events[_next_index].get("tick", 0)) <= _elapsed_ticks:
		due.append(events[_next_index])
		_next_index += 1
	return due

## Jumps straight to the end, returning every remaining event in order.
## Used for "skip replay" -- still emits every event so no HP/death/status
## change is ever skipped, only the wait between them.
func skip_to_end() -> Array:
	var due: Array = []
	while _next_index < events.size():
		due.append(events[_next_index])
		_next_index += 1
	_elapsed_ticks = max_ticks
	return due
