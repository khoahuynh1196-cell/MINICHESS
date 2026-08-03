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
	var errors := PackedStringArray()
	for hero_id in hero_ids:
		if resolve_hero_texture(hero_id) == null:
			errors.append("missing sprite asset for %s" % hero_id)
	return errors

# This is the runtime AssetCatalog contract. Unknown IDs deliberately return an
# empty profile: presentation must never silently substitute H01 in a release.
static func hero_profile(hero_id: String) -> Dictionary:
	var manifest := load_manifest()
	var profile_key := "VP_%s" % hero_id
	var profile: Dictionary = Dictionary(manifest.get("visual_profiles", {}).get(profile_key, {})).duplicate(true)
	if profile.is_empty():
		return {}
	for required_key in ["portrait", "sprite", "icon", "vfx"]:
		if String(profile.get(required_key, "")).is_empty():
			return {}
	profile["id"] = hero_id
	return profile

static func validate_all_assets() -> PackedStringArray:
	var errors := PackedStringArray()
	var assets: Dictionary = load_manifest().get("assets", {})
	for asset_key in assets:
		var record: Dictionary = assets[asset_key]
		var asset_path := String(record.get("path", ""))
		if asset_path.is_empty() or not FileAccess.file_exists(asset_path):
			errors.append("missing manifest asset %s" % asset_key)
			continue
		if load(asset_path) == null:
			errors.append("unloadable manifest asset %s" % asset_key)
	return errors

static func resolve_hero_texture(hero_id: String) -> Texture2D:
	return resolve_asset_texture(String(hero_profile(hero_id).get("sprite", "")))

static func resolve_hero_vfx_texture(hero_id: String) -> Texture2D:
	var manifest := load_manifest()
	var profile := hero_profile(hero_id)
	var vfx_key := String(profile.get("vfx", ""))
	var asset: Dictionary = manifest.get("assets", {}).get(vfx_key, {})
	# The current hero skills use CombatVfx2D's code-drawn effects. Marking the
	# manifest entry procedural prevents a hero cutout or placeholder atlas tile
	# from becoming a translucent runtime sprite layer.
	if String(asset.get("render_mode", "")) == "procedural":
		return null
	return resolve_asset_texture(vfx_key)

static func resolve_monster_texture(monster_id: String) -> Texture2D:
	var monsters: Dictionary = load_manifest().get("monsters", {})
	var monster: Dictionary = monsters.get(monster_id, {})
	return resolve_asset_texture(String(monster.get("sprite", "")))

static func resolve_transformation_texture(unique_item_id: String) -> Texture2D:
	var transformations: Dictionary = load_manifest().get("transformations", {})
	var transformation: Dictionary = transformations.get("VT_%s" % unique_item_id, {})
	return resolve_asset_texture(String(transformation.get("accessory", "")))

static func resolve_transformation_vfx_texture(unique_item_id: String) -> Texture2D:
	var transformations: Dictionary = load_manifest().get("transformations", {})
	var transformation: Dictionary = transformations.get("VT_%s" % unique_item_id, {})
	return resolve_asset_texture(String(transformation.get("vfx", "")))

static func resolve_biome_texture(biome_id: String) -> Texture2D:
	var biomes: Dictionary = load_manifest().get("biomes", {})
	var biome: Dictionary = biomes.get(biome_id, {})
	var layers: Array = biome.get("layers", [])
	return resolve_asset_texture(String(layers.front())) if not layers.is_empty() else null

static func resolve_item_texture(item_id: String) -> Texture2D:
	var items: Dictionary = load_manifest().get("items", {})
	var item: Dictionary = items.get(item_id, {})
	return resolve_asset_texture(String(item.get("icon", "")))

static func resolve_vfx_texture(asset_key: String) -> Texture2D:
	return resolve_asset_texture(asset_key)

static func resolve_asset_texture(asset_key: String) -> Texture2D:
	var assets: Dictionary = load_manifest().get("assets", {})
	var record: Dictionary = assets.get(asset_key, {})
	var atlas_path := String(record.get("path", ""))
	var frames: Array = record.get("frames", [])
	if atlas_path.is_empty() or frames.is_empty() or not FileAccess.file_exists(atlas_path):
		return null
	var atlas := load(atlas_path) as Texture2D
	if atlas == null:
		return null
	var frame: Dictionary = frames[0]
	var region := Rect2(float(frame.get("x", -1)), float(frame.get("y", -1)), float(frame.get("width", 0)), float(frame.get("height", 0)))
	if region.position.x < 0.0 or region.position.y < 0.0 or region.size.x <= 0.0 or region.size.y <= 0.0:
		return null
	if region.position == Vector2.ZERO and region.size == atlas.get_size():
		return atlas
	var texture := AtlasTexture.new()
	texture.atlas = atlas
	texture.region = region
	return texture
