extends SceneTree

const ScreenRouterScript = preload("res://scripts/ui/screen_router.gd")
const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const UnitViewScript = preload("res://scripts/unit_view.gd")
const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var router = ScreenRouterScript.new()
	var screen_ids := ["lobby", "map", "prepare", "combat", "reward", "recap", "collection", "settings", "online"]
	for screen_id in screen_ids:
		if not _expect(router.show_screen(screen_id), "router must accept %s" % screen_id):
			break
		if not _expect(router.current_screen_id == screen_id, "router must make %s current" % screen_id):
			break
		if not _expect(router.visible_screen_count() == 1, "router must show exactly one root for %s" % screen_id):
			break
		var root: Control = router.screen_root(screen_id)
		_expect(root != null and root.get_anchor(SIDE_RIGHT) == 1.0 and root.get_anchor(SIDE_BOTTOM) == 1.0, "router roots must fill the portrait canvas for %s" % screen_id)
	var current_screen: String = router.current_screen_id
	_expect(not router.show_screen("unknown"), "router must reject an unknown screen ID")
	_expect(router.current_screen_id == current_screen, "an unknown screen must not replace the current screen")
	_expect(router.visible_screen_count() == 1, "an unknown screen must preserve the visible root")
	_expect(ThemeTokensScript.CONTENT_BOUNDS.end.y <= ThemeTokensScript.PORTRAIT_HEIGHT, "theme content bounds must stay inside the portrait viewport")
	_expect(ThemeTokensScript.font_size("title") > ThemeTokensScript.font_size("body"), "theme tokens must provide a semantic type scale")
	_expect(ThemeTokensScript.motion_duration(0.2, true) == 0.0, "reduced motion must suppress transition duration")
	var controller = BattleControllerScript.new()
	controller._create_mobile_ui()
	controller.settings["language"] = "en"
	controller.localization.set_locale("en")
	controller.show_mobile_screen("settings")
	var settings_screen = controller.screen_router.settings_screen
	var settings_title: Label = settings_screen.find_child("SettingsTitle", true, false) as Label
	_expect(settings_title != null and settings_title.text == "Settings", "routed settings must start with English catalog text")
	controller._toggle_language()
	settings_title = settings_screen.find_child("SettingsTitle", true, false) as Label
	var sound_toggle: CheckButton = settings_screen.find_child("Toggle_sound", true, false) as CheckButton
	var language_button: Button = settings_screen.find_child("Language", true, false) as Button
	_expect(settings_title != null and sound_toggle != null and language_button != null and settings_title.text == "Cai dat" and sound_toggle.text == "Am thanh" and language_button.text.contains("Tieng Viet"), "routed language selection must visibly replace settings text with Vietnamese catalog text")
	controller._toggle_language()
	controller.apply_run_view({
		"id": "run-router-reward", "state": "REWARD", "round": 4, "revision": 7,
		"gold": 8, "health": 30, "shop": [], "bench": [], "board": [],
		"items": [{ "instanceId": "unique:router:U01", "itemId": "U01", "kind": "unique" }],
		"roundRewardPlan": { "round": 4, "offers": [
			{ "id": "reward:4:hero_choice:1", "kind": "hero_choice", "options": [{ "id": "H02", "kind": "hero" }] },
			{ "id": "reward:4:normal_item_choice:0", "kind": "normal_item_choice", "options": [{ "id": "I01", "kind": "normal_item" }] },
		] },
	})
	var reward_root: Control = controller.screen_router.screen_root("reward")
	_expect(reward_root.has_signal("select_reward") and reward_root.has_signal("ack_unique"), "router must host the dedicated reward screen rather than a generic control")
	var reward_commands: Array = []
	controller.command_requested.connect(func(payload: Dictionary) -> void: reward_commands.append(payload))
	reward_root.choose_server_option("reward:4:hero_choice:1", "H02")
	_expect(reward_commands.is_empty(), "the reward bridge must not claim until every server offer has a selection")
	reward_root.choose_server_option("reward:4:normal_item_choice:0", "I01")
	_expect(reward_commands == [{ "command_id": "client-reward-7", "expected_run_revision": 7, "type": "CLAIM_ROUND_REWARD", "reward_selections": [{ "offer_id": "reward:4:hero_choice:1", "option_id": "H02" }, { "offer_id": "reward:4:normal_item_choice:0", "option_id": "I01" }] }], "reward UI selection must bridge each item and hero choice to one authoritative claim without mutating the local run")
	controller.show_mobile_screen("collection")
	var collection_root: Control = controller.screen_router.screen_root("collection")
	_expect(collection_root.has_method("visible_hero_ids") and collection_root.visible_hero_ids().size() == 20, "router must host the dedicated 20-card collection screen")
	var unit = UnitViewScript.new()
	controller.unit_views["test-unit"] = unit
	controller.set_reduced_motion(true)
	_expect(unit.reduced_motion, "reduced motion must update units that are already visible")
	controller.free()
	unit.free()
	router.free()
	if _failed:
		quit(1)
		return
	print("PASS screen_router_test")
	quit(0)

func _expect(condition: bool, message: String) -> bool:
	if not condition:
		_failed = true
		push_error(message)
	return condition
