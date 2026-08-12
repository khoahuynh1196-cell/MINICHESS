extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

var _failed := false

func _init() -> void:
	var manifest := AssetManifestScript.load_manifest()
	var manifest_runtime = AssetManifestScript.new()
	_expect(String(manifest.get("version", "")) == "asset-4x6-0.1.0", "asset manifest must declare the active canonical asset version")
	_expect(AssetManifestScript.validate_hero_assets(HeroVisualCatalogScript.hero_ids()).is_empty(), "every roster hero must resolve to a declared sprite asset")
	_expect(AssetManifestScript.validate_all_assets().is_empty(), "every declared manifest asset must be runtime-loadable")
	for hero_id in HeroVisualCatalogScript.hero_ids():
		var texture := AssetManifestScript.resolve_hero_texture(hero_id)
		_expect(texture is Texture2D and String(texture.resource_path).find("hero-roster-atlas-v1") == -1, "%s must resolve an individual hero cutout, never the rejected roster atlas" % hero_id)
		var profile: Dictionary = manifest.get("visual_profiles", {}).get("VP_%s" % hero_id, {})
		var sprite_asset: Dictionary = manifest.get("assets", {}).get(String(profile.get("sprite", "")), {})
		_expect(String(sprite_asset.get("path", "")).begins_with("res://assets/sprites/h%s" % hero_id.substr(1).to_lower()), "%s must use its matching individual sprite source" % hero_id)
	var monster_ids := ["meadow", "meadow_elite", "meadow_boss", "meadow_boss_family", "ruins", "ruins_elite", "ruins_boss", "ruins_boss_family", "frost_keep", "frost_keep_elite", "frost_keep_boss", "frost_keep_boss_family", "ember_citadel", "ember_citadel_elite", "ember_citadel_boss", "ember_citadel_boss_family"]
	_expect(Dictionary(manifest.get("monsters", {})).size() == 16, "the manifest must register all sixteen biome monster variants")
	for monster_id in monster_ids:
		_expect(manifest_runtime.call("resolve_monster_texture", monster_id) is Texture2D, "%s monster must resolve a runtime cutout" % monster_id)
		var monster_record: Dictionary = manifest.get("monsters", {}).get(monster_id, {})
		_expect(String(monster_record.get("source_mode", "")) == "generated_cutout", "%s must use a generated cutout source" % monster_id)
	for biome_id in ["meadow", "ruins", "frost_keep", "ember_citadel"]:
		_expect(AssetManifestScript.resolve_biome_texture(biome_id) is Texture2D, "%s biome layer must resolve for its live board consumer" % biome_id)
	_expect(AssetManifestScript.resolve_item_texture("I01") is Texture2D, "declared item icon art must resolve for its HUD consumer")
	_expect(AssetManifestScript.resolve_vfx_texture("transformations/lion_crown/vfx") is Texture2D, "declared VFX art must resolve for CombatVfx")
	_expect(AssetManifestScript.resolve_biome_texture("void") == null and AssetManifestScript.resolve_item_texture("I99") == null and AssetManifestScript.resolve_vfx_texture("missing/vfx") == null, "missing presentation keys must not silently fall back")
	_expect(not JSON.stringify(manifest).contains("hero-roster-atlas-v1.png"), "the rejected hero roster card atlas must not remain in the manifest")
	_expect(not JSON.stringify(manifest).contains("monster-hud-vfx-atlas-v2.png"), "the rejected monster HUD card atlas must not remain in the manifest")
	_expect(AssetManifestScript.resolve_hero_texture("H99") == null, "an unknown hero must not resolve a runtime texture")
	_expect(not AssetManifestScript.validate_hero_assets(["H99"]).is_empty(), "a missing hero asset must be diagnosed")
	if _failed:
		quit(1)
		return
	print("PASS asset_manifest_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
