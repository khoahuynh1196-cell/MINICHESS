class_name AssetManifest
extends RefCounted

const MANIFEST_PATH := "res://assets/asset_manifest.json"

static func load_manifest() -> Dictionary:
	var file := FileAccess.open(MANIFEST_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	return Dictionary(parsed) if typeof(parsed) == TYPE_DICTIONARY else {}

static func validate_hero_assets(hero_ids: Array[String]) -> PackedStringArray:
	var manifest := load_manifest()
	var sprites: Dictionary = manifest.get("hero_sprites", {})
	var errors := PackedStringArray()
	for hero_id in hero_ids:
		var asset_path := String(sprites.get(hero_id, ""))
		if asset_path.is_empty() or not ResourceLoader.exists(asset_path):
			errors.append("missing sprite asset for %s" % hero_id)
	return errors
