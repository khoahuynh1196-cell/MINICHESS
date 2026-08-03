extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroRigScript = preload("res://scripts/presentation/hero_rig_2d.gd")

func _init() -> void:
	var h01_texture_key := _skill_texture_key("H01")
	var h02_texture_key := _skill_texture_key("H02")
	_expect(h01_texture_key == _texture_key(AssetManifestScript.resolve_hero_vfx_texture("H01")), "H01 skill VFX must use H01's declared visual-profile VFX")
	_expect(h02_texture_key == _texture_key(AssetManifestScript.resolve_hero_vfx_texture("H02")), "H02 skill VFX must use H02's declared visual-profile VFX")
	_expect(h01_texture_key != h02_texture_key, "different hero profiles must not share a fixed lion-crown VFX texture")
	var unique_rig = HeroRigScript.new()
	unique_rig.configure("H01", null, true, "U02")
	unique_rig.play_action("skill_cast")
	var unique_layer = unique_rig.find_child("ManifestVfxLayer", true, false)
	_expect(unique_layer != null and _texture_key(unique_layer.texture) == _texture_key(AssetManifestScript.resolve_transformation_vfx_texture("U02")), "an equipped Unique must replace skill VFX only with its own transformation VFX")
	unique_rig.free()
	if bool(get_meta("failed", false)):
		quit(1)
		return
	print("PASS hero_vfx_manifest_test")
	quit(0)

func _skill_texture_key(hero_id: String) -> String:
	var rig = HeroRigScript.new()
	rig.configure(hero_id)
	rig.play_action("skill_cast")
	var layer = rig.find_child("ManifestVfxLayer", true, false)
	if layer == null:
		_fail("%s must create a manifest VFX layer" % hero_id)
		return ""
	var key := _texture_key(layer.texture)
	rig.free()
	return key

func _texture_key(texture: Texture2D) -> String:
	var atlas := texture as AtlasTexture
	if atlas != null:
		return "%s:%s" % [atlas.atlas.resource_path, atlas.region]
	return texture.resource_path if texture != null else ""

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	set_meta("failed", true)
	push_error(message)
