extends SceneTree

const FormationControllerScript = preload("res://scripts/ui/formation_controller.gd")

var _failed := false

func _init() -> void:
	var controller = FormationControllerScript.new()
	var requests: Array = []
	controller.move_requested.connect(func(hero_instance_id: String, destination: int) -> void:
		requests.append({ "hero": hero_instance_id, "destination": destination })
	)
	_expect(controller.request_move("hero-a", 12, "PREPARE"), "a bench-to-board request must be emitted in prepare")
	_expect(controller.request_return_to_bench("hero-a", 0, "PREPARE"), "a board-to-bench request must use a legal bench slot")
	_expect(controller.select_hero("hero-b", "PREPARE"), "tap fallback must select a hero during prepare")
	_expect(controller.request_selected_move(13, "PREPARE"), "tap fallback must emit the selected hero move")
	_expect(not controller.has_selection(), "a completed tap fallback move must clear selection")
	_expect(controller.request_drag_drop("hero-c", 14, "PREPARE"), "drag drop must emit the same move intent")
	_expect(not controller.request_move("hero-a", 8, "PREPARE"), "the gap between bench and board coordinates must be rejected")
	_expect(not controller.request_move("hero-a", 12, "COMBAT"), "formation changes must be rejected outside prepare")
	_expect(requests == [{ "hero": "hero-a", "destination": 12 }, { "hero": "hero-a", "destination": 0 }, { "hero": "hero-b", "destination": 13 }, { "hero": "hero-c", "destination": 14 }], "only legal formation requests must be emitted")
	if _failed:
		quit(1)
		return
	print("PASS formation_controller_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
