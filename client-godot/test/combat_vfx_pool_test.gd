extends SceneTree

const CombatVfxPoolScript = preload("res://scripts/combat_vfx_pool.gd")

var _failed := false

func _init() -> void:
	_run()

func _run() -> void:
	var pool = CombatVfxPoolScript.new()
	get_root().add_child(pool)
	pool.unit_position_resolver = func(unit_id: String) -> Vector2: return Vector2(20, 30) if unit_id == "hero" else Vector2(80, 90)
	var damage = pool.present(_event("DAMAGE_APPLIED", "enemy", "hero", { "amount": 42 }))
	_expect(pool.last_route == "damage" and damage.combat_label.text == "-42", "damage events must route to damage VFX and floating combat text")
	damage._process(damage.duration + 0.05)
	_expect(damage.get_parent() == pool and pool.active_count() == 0 and not damage.visible, "a tree-owned VFX expiry must release its instance back to the pool")
	var heal = pool.present(_event("HEAL_APPLIED", "hero", "hero", { "amount": 25 }))
	_expect(heal == damage and pool.last_route == "heal" and heal.combat_label.text == "+25", "released VFX instances must be reused for heal routing")
	pool.release(heal)
	var shield = pool.present(_event("SHIELD_APPLIED", "hero", "hero", { "amount": 15 }))
	_expect(pool.last_route == "shield" and shield.combat_label.text.contains("Shield"), "shield events must route to a protective VFX label")
	pool.release(shield)
	var cc = pool.present(_event("STUN_APPLIED", "enemy", "hero", {}))
	_expect(pool.last_route == "cc" and cc.combat_label.text.contains("Stunned"), "crowd-control events must route to a status VFX label")
	pool.set_reduced_motion(true)
	pool.release(cc)
	var reduced = pool.present(_event("DAMAGE_APPLIED", "enemy", "hero", { "amount": 1 }))
	reduced._process(0.05)
	_expect(reduced.reduced_motion and reduced.duration >= 1.0 and reduced.visible and reduced.combat_label.visible, "reduced motion must retain readable static floating combat text for a deterministic window")
	pool.free()
	if _failed:
		quit(1)
		return
	print("PASS combat_vfx_pool_test")
	quit(0)

func _event(type: String, source_unit_id: String, target_unit_id: String, payload: Dictionary) -> Dictionary:
	return { "type": type, "source_unit_id": source_unit_id, "target_unit_id": target_unit_id, "payload": payload }

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	_failed = true
	push_error(message)
