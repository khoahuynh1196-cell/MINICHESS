extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

var _failed := false

func _init() -> void:
	for biome_id in ["meadow", "ruins", "frost_keep", "ember_citadel"]:
		var texture := AssetManifestScript.resolve_arena_4x6_texture(biome_id)
		_expect(texture != null, "%s must resolve the authored 4x6 arena texture" % biome_id)
		if texture != null:
			_expect(texture.get_width() == 1035 and texture.get_height() == 1520, "%s arena must retain the shared 1035x1520 portrait source" % biome_id)
	if _failed:
		quit(1)
		return
	print("PASS arena_asset_pack_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	_failed = true
	push_error(message)
