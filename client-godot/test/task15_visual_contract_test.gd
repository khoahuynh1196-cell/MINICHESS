extends SceneTree

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const UnitViewScript = preload("res://scripts/unit_view.gd")
const BattleControllerScript = preload("res://scripts/battle_controller.gd")
const CombatEventScript = preload("res://scripts/combat_event.gd")

var _failed := false

func _init() -> void:
	var manifest = AssetManifestScript.new()
	_expect(manifest.has_method("hero_profile"), "AssetManifest must expose a unified hero_profile contract")
	if manifest.has_method("hero_profile"):
		for index in 20:
			var hero_id := "H%02d" % (index + 1)
			var profile: Dictionary = manifest.call("hero_profile", hero_id)
			_expect(profile.get("id", "") == hero_id, "%s must resolve its own visual profile" % hero_id)
			for field in ["portrait", "sprite", "icon", "vfx"]:
				_expect(not String(profile.get(field, "")).is_empty(), "%s must expose %s art" % [hero_id, field])
			_expect(profile.get("animations", {}) is Dictionary and Dictionary(profile.get("animations", {})).has_all(["idle", "move", "basic_attack", "skill_cast", "hit", "death"]), "%s must map all six replay visual states" % hero_id)
		_expect(Dictionary(manifest.call("hero_profile", "H99")).is_empty(), "unknown hero profiles must be rejected instead of falling back in release")
		var h20_profile: Dictionary = manifest.call("hero_profile", "H20")
		var unit = UnitViewScript.new()
		unit.call("configure", "player", 12, 100000, h20_profile)
		_expect(unit.hero_id == "H20", "UnitView must consume the resolved profile rather than a color-only hero ID")
		for visual_state in ["idle", "move", "basic_attack", "skill_cast", "hit"]:
			unit.present(visual_state)
			_expect(unit.hero_rig != null and unit.hero_rig.animation_state == visual_state, "UnitView must route %s to the hero rig" % visual_state)
		unit.set_hp(0)
		_expect(unit.hero_rig != null and unit.hero_rig.animation_state == "death", "UnitView must route death to the hero rig")
		_expect(unit.has_method("set_mana") and unit.has_method("set_status"), "UnitView must expose mana and status presentation routes")
		if unit.has_method("set_mana"):
			unit.call("set_mana", 25, 100)
			_expect(unit.get("mana") == 25 and unit.get("max_mana") == 100, "mana indicator state must be retained for rendering")
		if unit.has_method("set_status"):
			unit.call("set_status", "stunned")
			_expect(unit.get("status") == "stunned", "status indicator state must be retained for rendering")
		unit.free()
	var controller = BattleControllerScript.new()
	for biome_id in ["meadow", "ruins", "frost_keep", "ember_citadel"]:
		controller.call("_show_biome_layer", biome_id)
		var layer := controller.get_node_or_null("BiomeLayer") as Sprite2D
		_expect(layer != null and layer.texture != null, "%s must select a data-driven board layer" % biome_id)
	controller.call("_create_mobile_ui")
	controller.show_mobile_screen("combat")
	var combat_screen: Control = controller.screen_router.screen_root("combat")
	var opaque_backgrounds := combat_screen.get_children().filter(func(child): return child is ColorRect and child.color.a >= 1.0)
	_expect(opaque_backgrounds.is_empty(), "combat UI must leave the runtime board visible behind its panels")
	var status_unit = UnitViewScript.new()
	status_unit.configure("player", 12, 100000, manifest.call("hero_profile", "H01"))
	controller.unit_views["status-target"] = status_unit
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 1, "tick": 1, "type": "STUN_APPLIED", "target_unit_id": "status-target", "payload": {} }))
	_expect(status_unit.status == "stunned", "status events must feed the UnitView status indicator")
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 2, "tick": 2, "type": "CLEANSE_APPLIED", "target_unit_id": "status-target", "payload": {} }))
	_expect(status_unit.status.is_empty(), "cleanse events must clear the UnitView status indicator")
	status_unit.free()
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS task15_visual_contract_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	_failed = true
	push_error(message)
