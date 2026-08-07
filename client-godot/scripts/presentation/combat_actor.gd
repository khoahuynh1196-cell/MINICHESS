class_name CombatActor
extends RefCounted

## Derives one unit's presentation state (HP, position, animation state)
## from the authoritative playback event stream, tick-accurate: querying
## state_at(tick) never reflects an event whose own tick is later than the
## queried tick, regardless of how many events have already been applied.
##
## Animation state priority (highest wins when windows overlap), per the
## Mission 8 spec: dead > hard_control > hit > cast > attack > move > idle.
## HP changes only ever happen inside apply_event() for DAMAGE_APPLIED /
## HEAL_APPLIED, at the exact tick the authoritative event carries --
## never interpolated, never predicted ahead of it.

const HIT_STATE_TICKS := 6
const STATE_PRIORITY := {
	"dead": 6, "hard_control": 5, "hit": 4, "cast": 3, "attack": 2, "move": 1, "idle": 0,
}

var unit_id := ""
var side := ""
var hero_id := ""
var hp := 0
var max_hp := 0
var position := -1
var death_tick := -1

var _hard_control_windows: Array = []
var _hit_windows: Array = []
var _cast_windows: Array = []
var _attack_windows: Array = []
var _move_windows: Array = []
var _pending_move_start := -1
var _pending_move_from := -1

func _init(id: String) -> void:
	unit_id = id

func is_dead_at(tick: int) -> bool:
	return death_tick >= 0 and tick >= death_tick

## Applies one authoritative event to this actor if it targets/sources this
## unit. Events for other units are ignored (the presenter dispatches every
## event to every actor; each actor only reacts to the ones about it).
func apply_event(event: Dictionary) -> void:
	var event_type := String(event.get("type", ""))
	var tick := int(event.get("tick", 0))
	var payload: Dictionary = Dictionary(event.get("payload", {}))
	var source_id := String(event.get("sourceUnitId", ""))
	var target_id := String(event.get("targetUnitId", ""))

	match event_type:
		"UNIT_SPAWNED":
			if String(payload.get("unitId", "")) != unit_id:
				return
			side = String(payload.get("side", ""))
			hp = int(payload.get("hp", 0))
			max_hp = hp
			position = int(payload.get("position", -1))
		"DAMAGE_APPLIED":
			if target_id != unit_id:
				return
			hp = int(payload.get("remainingHp", hp))
			_hit_windows.append({ "start": tick, "end": tick + HIT_STATE_TICKS })
		"HEAL_APPLIED":
			if target_id != unit_id:
				return
			hp = int(payload.get("remainingHp", hp))
		"STATUS_APPLIED":
			if target_id != unit_id or String(payload.get("kind", "")) != "stun":
				return
			var duration := int(payload.get("durationTicks", 0))
			_hard_control_windows.append({ "start": tick, "end": tick + duration })
		"CAST_STARTED":
			if source_id != unit_id:
				return
			var end_tick: int = int(event.get("impactTick", event.get("releaseTick", tick)))
			_cast_windows.append({ "start": tick, "end": end_tick })
		"ATTACK_STARTED":
			if source_id != unit_id:
				return
			var attack_end: int = int(event.get("impactTick", event.get("releaseTick", tick)))
			_attack_windows.append({ "start": tick, "end": attack_end })
		"MOVE_STARTED":
			var displacement_kind := String(payload.get("kind", ""))
			if displacement_kind.is_empty():
				# Regular pathing: paired with a later MOVE_COMPLETED from the same source.
				if source_id != unit_id:
					return
				_pending_move_start = tick
				_pending_move_from = int(payload.get("from", position))
			else:
				# One-shot displacement (dash/retreat/knockback): the unit whose
				# position changes is the target, not the source (e.g. a
				# knockback's source is the caster, its target is the unit
				# being pushed) -- and there is no paired MOVE_COMPLETED, so
				# position updates immediately from this single event.
				if target_id != unit_id:
					return
				position = int(payload.get("to", position))
				_move_windows.append({ "start": tick, "end": tick + HIT_STATE_TICKS })
		"MOVE_COMPLETED":
			if source_id != unit_id:
				return
			position = int(payload.get("to", position))
			if _pending_move_start >= 0:
				_move_windows.append({ "start": _pending_move_start, "end": tick })
				_pending_move_start = -1
		"UNIT_DIED":
			var died_unit_id := String(payload.get("unitId", target_id))
			if died_unit_id != unit_id:
				return
			death_tick = tick
			hp = 0

## Returns the single highest-priority animation state active at `tick`.
## A unit already dead by this tick is always "dead", overriding every
## other window -- death can never be overwritten by a later idle/move
## event that happens to still be queued for another unit.
func state_at(tick: int) -> String:
	if is_dead_at(tick):
		return "dead"
	var active := ["idle"]
	if _window_active(_hard_control_windows, tick):
		active.append("hard_control")
	if _window_active(_hit_windows, tick):
		active.append("hit")
	# A regular move in progress is an open-ended window: MOVE_STARTED has
	# already happened but MOVE_COMPLETED (which closes _move_windows) has
	# not been applied yet, so the window must still read as active.
	if _pending_move_start >= 0 and tick >= _pending_move_start:
		active.append("move")
	if _window_active(_cast_windows, tick):
		active.append("cast")
	if _window_active(_attack_windows, tick):
		active.append("attack")
	if _window_active(_move_windows, tick):
		active.append("move")
	var best := "idle"
	for state in active:
		if STATE_PRIORITY[state] > STATE_PRIORITY[best]:
			best = state
	return best

func _window_active(windows: Array, tick: int) -> bool:
	for window in windows:
		if tick >= int(window["start"]) and tick < int(window["end"]):
			return true
	return false
