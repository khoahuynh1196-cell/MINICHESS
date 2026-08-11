extends SceneTree

const CATALOG_PATH := "res://scripts/presentation/adventure_encounter_catalog.gd"
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

var _failed := false

func _init() -> void:
	var catalog_script = load(CATALOG_PATH)
	_expect(catalog_script != null, "Adventure encounter catalog must be independently loadable")
	if catalog_script != null:
		var catalog = catalog_script.new()
		var expected_biomes := ["meadow", "meadow", "ruins", "ruins", "frost_keep", "frost_keep", "ember_citadel", "ember_citadel"]
		var encounter_names: Dictionary = {}
		for index in expected_biomes.size():
			var round := index + 1
			var encounter: Dictionary = catalog.call("for_round", round)
			_expect(int(encounter.get("round", 0)) == round and String(encounter.get("biome", "")) == expected_biomes[index], "round %d must expose its canonical biome encounter" % round)
			_expect(not String(encounter.get("name", "")).is_empty() and not encounter_names.has(String(encounter.get("name", ""))), "round %d must have a unique player-facing encounter name" % round)
			encounter_names[String(encounter.get("name", ""))] = true
			var previews: Array = catalog.call("enemy_previews_for_round", round)
			_expect(not previews.is_empty(), "round %d must expose at least one enemy preview" % round)
			for preview_value in previews:
				var preview: Dictionary = Dictionary(preview_value)
				_expect(int(preview.get("position", -1)) >= 0 and int(preview.get("position", -1)) < 16, "round %d enemy preview positions must stay in the enemy half" % round)
				_expect(AssetManifestScript.resolve_monster_texture(String(preview.get("monsterId", ""))) is Texture2D, "round %d enemy preview must resolve through the manifest" % round)
		_expect(encounter_names.size() == 8, "all eight Adventure encounters must remain distinct")
	if _failed:
		quit(1)
		return
	print("PASS adventure_encounter_catalog_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
