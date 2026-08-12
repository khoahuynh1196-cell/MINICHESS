extends SceneTree

const CombatVfxPoolScript = preload("res://scripts/combat_vfx_pool.gd")
const VfxManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

func _init() -> void:
	var pool = CombatVfxPoolScript.new()
	get_root().add_child(pool)
	pool.unit_position_resolver = func(_unit_id: String) -> Vector2: return Vector2(540.0, 500.0)
	var peak := 0
	var reused := 0
	var first = null
	for round_index in range(8):
		for unit_index in range(8):
			var effect = pool.present({ "type": "DAMAGE_APPLIED", "target_unit_id": "player:%d" % unit_index, "payload": { "amount": round_index + unit_index + 1 } })
			peak = maxi(peak, pool.active_count())
			if first == null:
				first = effect
			pool.release(effect)
			if effect == first:
				reused += 1
	var manifest_errors := PackedStringArray()
	for key in ["combat_vfx/damage", "combat_vfx/heal", "combat_vfx/shield", "combat_vfx/cc"]:
		if VfxManifestScript.resolve_vfx_texture(key) == null:
			manifest_errors.append("missing %s" % key)

	_expect(peak <= 1, "pooled VFX must not allocate one permanent node per event")
	_expect(reused >= 63, "8x8 deterministic stress must reuse the pooled effect")
	_expect(manifest_errors.is_empty(), "combat route VFX must resolve through the asset manifest")
	pool.free()
	print("PASS gate2_stress_test peak_active=%d reused=%d" % [peak, reused])
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	push_error(message)
	quit(1)
