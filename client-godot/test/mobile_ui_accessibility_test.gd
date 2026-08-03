extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")
const TOUCH_TARGET := 44.0

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	controller._create_mobile_ui()
	for screen_id in ["lobby", "map", "collection", "settings"]:
		controller.show_mobile_screen(screen_id)
		_expect_touch_targets(controller.screen_router.screen_root(screen_id))
	controller.apply_run_view({
		"id": "run-mobile-accessibility", "state": "PREPARE", "round": 1, "revision": 0,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shopOdds": { "tier1": 55, "tier2": 35, "tier3": 10, "tier4": 0, "tier5": 0 },
		"shop": _shop(), "bench": [], "board": _board(), "items": [],
	})
	_expect_touch_targets(controller.screen_router.screen_root("prepare"))
	var card: Button = controller.screen_router.screen_root("prepare").find_child("BuySlot4", true, false) as Button
	_expect(card != null and card.text.strip_edges().is_empty() and card.tooltip_text.contains("Capybara Guardian"), "Prepare hero cards must have accessible full text even when the visible card uses custom labels")
	controller.show_mobile_screen("map")
	var disabled_count := _disabled_button_count(controller.screen_router.screen_root("map"))
	_expect(disabled_count == 7, "future encounter nodes must be visibly disabled")
	var controls_rect: Rect2 = controller.mobile_controls_rect()
	_expect(controls_rect.position.y >= 0.0 and controls_rect.end.y <= 1920.0, "mobile controls must stay inside portrait bounds")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS mobile_ui_accessibility_test")
	quit(0)

func _expect_touch_targets(root: Node) -> void:
	for child in root.get_children():
		if child is BaseButton:
			_expect(child.custom_minimum_size.y >= TOUCH_TARGET, "%s must have a 44px touch target" % child.text)
			_expect(not child.text.strip_edges().is_empty() or not child.tooltip_text.strip_edges().is_empty(), "touch controls must have a text alternative")
		_expect_touch_targets(child)

func _disabled_button_count(root: Node) -> int:
	var count := 0
	for child in root.get_children():
		if child is BaseButton and child.disabled:
			count += 1
		count += _disabled_button_count(child)
	return count

func _board() -> Array:
	var board: Array = []
	board.resize(12)
	board.fill(null)
	return board

func _shop() -> Array:
	return [
		{ "heroId": "H01", "cost": 1 }, { "heroId": "H02", "cost": 2 }, { "heroId": "H03", "cost": 3 }, { "heroId": "H04", "cost": 4 }, { "heroId": "H20", "cost": 5 },
	]

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
