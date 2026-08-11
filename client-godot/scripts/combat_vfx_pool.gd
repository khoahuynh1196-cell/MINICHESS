class_name CombatVfxPool
extends Node2D

const CombatVfxScript = preload("res://scripts/presentation/combat_vfx_2d.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

var unit_position_resolver: Callable
var last_route := ""
var _available: Array = []
var _active: Dictionary = {}
var _reduced_motion := false

func set_reduced_motion(enabled: bool) -> void:
	_reduced_motion = enabled

func present(event):
	var event_type := str(event.get("type") if event is Dictionary else event.type)
	var route := _route_for(event_type)
	if route.is_empty():
		return null
	last_route = route
	var vfx = _available.pop_back() if not _available.is_empty() else _create_vfx()
	var target_id := str(event.get("target_unit_id", event.get("source_unit_id", "")) if event is Dictionary else (event.target_unit_id if not event.target_unit_id.is_empty() else event.source_unit_id))
	vfx.position = _position_for(target_id)
	var payload: Dictionary = Dictionary(event.get("payload", {}) if event is Dictionary else event.payload)
	vfx.activate(route, _route_color(route), _floating_text(route, payload), _reduced_motion, AssetManifestScript.resolve_vfx_texture("combat_vfx/%s" % route))
	_active[vfx.get_instance_id()] = vfx
	return vfx

func release(vfx) -> void:
	if vfx == null:
		return
	_active.erase(vfx.get_instance_id())
	vfx.visible = false
	if not _available.has(vfx):
		_available.append(vfx)

func active_count() -> int:
	return _active.size()

func _create_vfx():
	var vfx = CombatVfxScript.new()
	vfx.name = "PooledCombatVfx"
	vfx.pooled = true
	vfx.expired.connect(func() -> void: release(vfx))
	add_child(vfx)
	return vfx

func _position_for(unit_id: String) -> Vector2:
	return unit_position_resolver.call(unit_id) if unit_position_resolver.is_valid() else Vector2.ZERO

func _route_for(event_type: String) -> String:
	match event_type:
		"DAMAGE_APPLIED": return "damage"
		"HEAL_APPLIED", "CLEANSE_APPLIED": return "heal"
		"SHIELD_APPLIED", "STAT_MODIFIER_APPLIED": return "shield"
		"STUN_APPLIED", "SLOW_APPLIED", "EFFECT_APPLIED": return "cc"
		_: return ""

func _route_color(route: String) -> Color:
	return { "damage": Color("#fb7185"), "heal": Color("#86efac"), "shield": Color("#7dd3fc"), "cc": Color("#c4b5fd") }.get(route, Color.WHITE)

func _floating_text(route: String, payload: Dictionary) -> String:
	var amount := str(payload.get("amount", ""))
	match route:
		"damage": return "-%s" % amount if not amount.is_empty() else "Damage"
		"heal": return "+%s" % amount if not amount.is_empty() else "Heal"
		"shield": return "Shield%s" % (" +%s" % amount if not amount.is_empty() else "")
		"cc": return "Stunned" if str(payload.get("status", "")) == "" else str(payload.get("status", "")).capitalize()
	return ""
