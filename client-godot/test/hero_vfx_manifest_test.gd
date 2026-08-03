extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroRigScript = preload("res://scripts/presentation/hero_rig_2d.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

func _init() -> void:
	var manifest := AssetManifestScript.load_manifest()
	for hero_id in HeroVisualCatalogScript.hero_ids():
		var profile: Dictionary = manifest.get("visual_profiles", {}).get("VP_%s" % hero_id, {})
		var vfx_key := String(profile.get("vfx", ""))
		var vfx_asset: Dictionary = manifest.get("assets", {}).get(vfx_key, {})
		_expect(String(vfx_asset.get("path", "")).begins_with("res://assets/vfx/"), "%s VFX must be a VFX-category source, never a hero cutout" % hero_id)
		_expect(String(vfx_asset.get("render_mode", "")) == "procedural", "%s must truthfully mark its procedural skill VFX fallback" % hero_id)
		_expect(AssetManifestScript.resolve_hero_vfx_texture(hero_id) == null, "%s procedural VFX must not supply a translucent sprite layer" % hero_id)
		var rig = HeroRigScript.new()
		rig.configure(hero_id)
		rig.play_action("skill_cast")
		_expect(rig.find_child("ManifestVfxLayer", true, false) == null, "%s runtime VFX must not overlay a hero image" % hero_id)
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
