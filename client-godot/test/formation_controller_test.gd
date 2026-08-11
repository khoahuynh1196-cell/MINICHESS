extends SceneTree

const FormationControllerScript = preload("res://scripts/ui/formation_controller.gd")

var _failed := false

func _init() -> void:
	var controller = FormationControllerScript.new()
	var requests: Array = []
	controller.move_requested.connect(func(hero_instance_id: String, destination: int) -> void:
		requests.append({ "hero": hero_instance_id, "destination": destination })
	)
	_expect(controller.request_move("hero-a", 16, "PREPARE"), "the first global player board target must be emitted in prepare")
	_expect(controller.request_move("hero-a", 31, "PREPARE"), "the final global player board target must be emitted in prepare")
	_expect(controller.request_return_to_bench("hero-a", 0, "PREPARE"), "a board-to-bench request must use a legal bench slot")
	_expect(controller.select_hero("hero-b", "PREPARE"), "tap fallback must select a hero during prepare")
	_expect(controller.request_selected_move(17, "PREPARE"), "tap fallback must emit the selected hero move")
	_expect(not controller.has_selection(), "a completed tap fallback move must clear selection")
	_expect(controller.request_drag_drop("hero-c", 30, "PREPARE"), "drag drop must emit the same move intent")
	_expect(not controller.request_move("hero-a", 15, "PREPARE"), "the last enemy target must be rejected")
	_expect(not controller.request_move("hero-a", 32, "PREPARE"), "the target after the player half must be rejected")
	_expect(not controller.request_move("hero-a", 0, "PREPARE"), "bench coordinates must use the dedicated return-to-bench action")
	_expect(not controller.request_move("hero-a", 16, "COMBAT"), "formation changes must be rejected outside prepare")
	_expect(requests == [{ "hero": "hero-a", "destination": 16 }, { "hero": "hero-a", "destination": 31 }, { "hero": "hero-a", "destination": 0 }, { "hero": "hero-b", "destination": 17 }, { "hero": "hero-c", "destination": 30 }], "only legal formation requests must be emitted")
	if _failed:
		quit(1)
		return
	print("PASS formation_controller_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
