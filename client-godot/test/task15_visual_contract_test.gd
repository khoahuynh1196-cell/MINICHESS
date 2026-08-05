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
		_expect(unit.position.is_equal_approx(Vector2(165.0, 610.0)), "player slot 12 must begin the lower half of the portrait 4x6 arena")
		unit.move_to(11)
		_expect(unit.position.is_equal_approx(Vector2(915.0, 490.0)), "enemy slot 11 must remain in the upper half of the portrait 4x6 arena")
		unit.move_to(12)
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
		if layer != null and layer.texture != null:
			_expect(layer.z_index == -1, "%s biome art must render immediately behind the readable board grid" % biome_id)
			_expect(layer.position.is_equal_approx(Vector2(540.0, 550.0)), "%s biome art must be centered in the 4x6 board" % biome_id)
			_expect(layer.scale.is_equal_approx(Vector2(1000.0 / layer.texture.get_size().x, 720.0 / layer.texture.get_size().y)), "%s biome art must be scaled to cover the 4x6 board" % biome_id)
	_expect(controller.has_method("board_tile_fill_color") and controller.call("board_tile_fill_color").a < 1.0, "the readable board tile overlay must remain translucent over the biome art")
	_expect(controller.has_method("board_base_color") and controller.call("board_base_color").a < 1.0, "the board base must not cover the data-driven biome art")
	controller.call("_create_mobile_ui")
	controller.show_mobile_screen("combat")
	var combat_screen: Control = controller.screen_router.screen_root("combat")
	var opaque_backgrounds := combat_screen.get_children().filter(func(child): return child is ColorRect and child.color.a >= 1.0)
	_expect(opaque_backgrounds.is_empty(), "combat UI must leave the runtime board visible behind its panels")
	var combat_backdrop := combat_screen.get_node_or_null("CombatBackdrop") as ColorRect
	_expect(combat_backdrop != null and combat_backdrop.color.a <= 0.6, "combat backdrop must preserve readable biome art rather than dim it behind an opaque veil")
	_expect(controller.has_method("combat_layout"), "combat must expose a responsive portrait composition")
	if controller.has_method("combat_layout"):
		var layout: Dictionary = controller.call("combat_layout")
		var controls_rect: Rect2 = layout.get("controls", Rect2())
		var message_rect: Rect2 = layout.get("message", Rect2())
		_expect(controls_rect.position.y <= 944.0, "the replay control rail must begin directly after the 4x6 board")
		_expect(message_rect.position.y <= controls_rect.end.y + 24.0, "the board message must follow the replay control rail without a giant gap")
		_expect(message_rect.end.y <= 1896.0 and message_rect.size.y > 0.0, "combat controls and board message must use the portrait capture viewport")
		_expect(controller.has_method("combat_notice_height"), "combat notice height must be derived from its readable content")
		if controller.has_method("combat_notice_height"):
			_expect(is_equal_approx(message_rect.size.y, float(controller.call("combat_notice_height"))), "combat notice layout must use the content-driven height")
			_expect(message_rect.size.y >= 160.0 and message_rect.size.y <= 220.0, "combat notice must stay compact while retaining readable portrait copy")
			var notice_panel := combat_screen.get_node_or_null("CombatBoardMessage") as PanelContainer
			_expect(notice_panel != null and is_equal_approx(notice_panel.size.y, message_rect.size.y), "combat notice panel must retain the compact readable layout at runtime")
	var status_unit = UnitViewScript.new()
	status_unit.configure("player", 12, 100000, manifest.call("hero_profile", "H01"))
	controller.unit_views["status-target"] = status_unit
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 1, "tick": 1, "type": "STUN_APPLIED", "target_unit_id": "status-target", "payload": {} }))
	_expect(status_unit.status == "stunned", "status events must feed the UnitView status indicator")
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 2, "tick": 2, "type": "CLEANSE_APPLIED", "target_unit_id": "status-target", "payload": {} }))
	_expect(status_unit.status.is_empty(), "cleanse events must clear the UnitView status indicator")
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 3, "tick": 3, "type": "MANA_CHANGED", "source_unit_id": "status-target", "payload": { "mana": 45000, "reason": "basic_attack" } }))
	_expect(status_unit.mana == 45000 and status_unit.max_mana == 100000, "an authoritative MANA_CHANGED event must update the unit mana bar state")
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
