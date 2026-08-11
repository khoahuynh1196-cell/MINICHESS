extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroRigScript = preload("res://scripts/presentation/hero_rig_2d.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

func _init() -> void:
	var manifest := AssetManifestScript.load_manifest()
	var authored_heroes := ["H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09", "H10", "H11", "H12"]
	for hero_id in HeroVisualCatalogScript.hero_ids():
		var profile: Dictionary = manifest.get("visual_profiles", {}).get("VP_%s" % hero_id, {})
		var vfx_key := String(profile.get("vfx", ""))
		var vfx_asset: Dictionary = manifest.get("assets", {}).get(vfx_key, {})
		_expect(String(vfx_asset.get("path", "")).begins_with("res://assets/vfx/"), "%s VFX must be a VFX-category source, never a hero cutout" % hero_id)
		var is_authored := authored_heroes.has(hero_id)
		_expect(String(vfx_asset.get("render_mode", "")) == ("authored" if is_authored else "procedural"), "%s VFX render mode must match its production asset status" % hero_id)
		_expect((AssetManifestScript.resolve_hero_vfx_texture(hero_id) != null) == is_authored, "%s VFX texture resolution must match its render mode" % hero_id)
		var rig = HeroRigScript.new()
		rig.configure(hero_id)
		rig.play_action("skill_cast")
		var manifest_layer := rig.find_child("ManifestVfxLayer", true, false)
		_expect((manifest_layer != null) == is_authored, "%s runtime VFX layer must match its authored manifest status" % hero_id)
		rig.free()
	var unique_rig = HeroRigScript.new()
	unique_rig.configure("H01", null, true, "U02")
	unique_rig.play_action("skill_cast")
	var unique_layer = unique_rig.find_child("ManifestVfxLayer", true, false)
	_expect(unique_layer != null and unique_layer.texture != null, "an equipped Unique may supply its own manifest VFX texture")
	unique_rig.free()
	if bool(get_meta("failed", false)):
		quit(1)
		return
	print("PASS hero_vfx_manifest_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		set_meta("failed", true)
		push_error(message)
