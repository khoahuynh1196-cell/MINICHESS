extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

var _failed := false

func _init() -> void:
	var manifest := AssetManifestScript.load_manifest()
	_expect(String(manifest.get("version", "")) == "alpha-0.3.0", "asset manifest must declare the active content version")
	_expect(AssetManifestScript.validate_hero_assets(HeroVisualCatalogScript.hero_ids()).is_empty(), "every roster hero must resolve to a declared sprite asset")
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
