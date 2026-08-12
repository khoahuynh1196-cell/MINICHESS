extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

var _failed := false

func _init() -> void:
	for biome_id in ["meadow", "ruins", "frost_keep", "ember_citadel"]:
		var texture := AssetManifestScript.resolve_arena_4x6_texture(biome_id)
		_expect(texture != null, "%s must resolve the authored 4x6 arena texture" % biome_id)
		if texture != null:
			_expect(texture.get_width() == 1024 and texture.get_height() == 1300, "%s arena must use the footer-safe 1024x1300 portrait source" % biome_id)
			var image := texture.get_image()
			var symmetric := true
			for y in range(0, image.get_height(), 32):
				for x in range(0, image.get_width() / 2, 32):
					if image.get_pixel(x, y) != image.get_pixel(image.get_width() - 1 - x, y):
						symmetric = false
						break
				if not symmetric:
					break
			_expect(symmetric, "%s arena must retain exact left/right symmetry" % biome_id)
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
