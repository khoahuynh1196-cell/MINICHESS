extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const CombatVfxScript = preload("res://scripts/presentation/combat_vfx_2d.gd")
const CombatVfxPoolScript = preload("res://scripts/combat_vfx_pool.gd")

var _failed := false

func _init() -> void:
	var texture := AssetManifestScript.resolve_vfx_texture("transformations/lion_crown/vfx")
	if texture == null:
		push_error("declared VFX art must resolve through the manifest")
		quit(1)
		return
	var vfx = CombatVfxScript.new()
	vfx.play("attack_flash", Color.WHITE, 1.0, texture)
	var layer = vfx.get_node_or_null("ManifestVfxLayer")
	if layer == null or layer.texture == null:
		push_error("CombatVfx must consume its supplied manifest texture layer")
		quit(1)
		return
	vfx.play("hit_spark", Color.WHITE, -1.0, texture)
	var manifest_layers := vfx.get_children().filter(func(child): return child is Sprite2D)
	if manifest_layers.size() != 1:
		push_error("CombatVfx must replace a pooled manifest layer instead of accumulating one per replayed cue")
		quit(1)
		return
	vfx.free()
	for route in ["damage", "heal", "shield", "cc"]:
		var authored_key := "combat_vfx/%s" % route
		var record: Dictionary = AssetManifestScript.load_manifest().get("assets", {}).get(authored_key, {})
		_expect(String(record.get("render_mode", "")) == "authored", "%s must declare an authored combat VFX layer" % authored_key)
		_expect(AssetManifestScript.resolve_vfx_texture(authored_key) is Texture2D, "%s authored combat VFX must resolve" % authored_key)
	var pool = CombatVfxPoolScript.new()
	var routed_vfx = pool.present({"type": "DAMAGE_APPLIED", "target_unit_id": "enemy:H01:0", "payload": {"amount": 12}})
	_expect(routed_vfx != null and routed_vfx.get_node_or_null("ManifestVfxLayer") != null, "combat pool must attach the authored route layer")
	pool.free()
	if _failed:
		quit(1)
		return
	print("PASS combat_vfx_manifest_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
