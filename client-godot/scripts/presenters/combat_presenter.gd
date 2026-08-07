class_name CombatPresenter
extends Node

## Drives a CombatTimeline + one CombatActor per unit from a real
## AdventureCombatPlayback. This is the piece Mission 8 asks for: given a
## recorded playback, it must produce the same semantic sequence every
## time and never expose a unit's HP/position/state ahead of the
## authoritative event that changes it -- both guaranteed by construction
## here (CombatActor only mutates inside apply_event, CombatTimeline only
## ever returns events whose tick has actually been reached).

const CombatTimelineScript = preload("res://scripts/presentation/combat_timeline.gd")
const CombatActorScript = preload("res://scripts/presentation/combat_actor.gd")

signal actor_changed(unit_id: String, snapshot: Dictionary)
signal combat_finished()

var timeline
var _actors: Dictionary = {}
var _order: Array = []

func load_playback(playback: Dictionary) -> void:
	timeline = CombatTimelineScript.new(playback)
	_actors.clear()
	_order.clear()

func set_speed_multiplier(multiplier: float) -> void:
	if timeline != null:
		timeline.set_speed_multiplier(multiplier)

func process(delta_seconds: float) -> void:
	if timeline == null:
		return
	for event in timeline.advance(delta_seconds):
		_apply(event)
	if timeline.is_finished():
		combat_finished.emit()

func skip_to_end() -> void:
	if timeline == null:
		return
	for event in timeline.skip_to_end():
		_apply(event)
	combat_finished.emit()

func actor(unit_id: String):
	return _actors.get(unit_id)

func actor_ids() -> Array:
	return _order.duplicate()

func _apply(event: Dictionary) -> void:
	var tick := int(event.get("tick", 0))
	for unit_id in _unit_ids_in(event):
		var current = _actor_for(unit_id)
		current.apply_event(event)
		actor_changed.emit(unit_id, _snapshot(current, tick))

func _unit_ids_in(event: Dictionary) -> Array:
	var payload: Dictionary = Dictionary(event.get("payload", {}))
	var ids: Array = []
	for id in [String(event.get("sourceUnitId", "")), String(event.get("targetUnitId", "")), String(payload.get("unitId", ""))]:
		if not id.is_empty() and not ids.has(id):
			ids.append(id)
	return ids

func _actor_for(unit_id: String):
	if not _actors.has(unit_id):
		_actors[unit_id] = CombatActorScript.new(unit_id)
		_order.append(unit_id)
	return _actors[unit_id]

func _snapshot(current, tick: int) -> Dictionary:
	return {
		"unitId": current.unit_id,
		"side": current.side,
		"heroId": current.hero_id,
		"hp": current.hp,
		"maxHp": current.max_hp,
		"position": current.position,
		"state": current.state_at(tick),
	}
