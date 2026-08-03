extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const CombatVfxScript = preload("res://scripts/presentation/combat_vfx_2d.gd")

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
	vfx.free()
	print("PASS combat_vfx_manifest_test")
	quit(0)
