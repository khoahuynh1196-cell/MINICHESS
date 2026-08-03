extends SceneTree

const FormationSlotButtonScript = preload("res://scripts/ui/formation_slot_button.gd")

var _failed := false

func _init() -> void:
	var source = FormationSlotButtonScript.new()
	source.configure_slot("hero-a", 0, true)
	var destination = FormationSlotButtonScript.new()
	destination.configure_slot("", 12, true)
	var dropped: Array = []
	destination.move_dropped.connect(func(hero_instance_id: String, target: int) -> void:
		dropped.append({ "hero": hero_instance_id, "destination": target })
	)
	var drag_data = source._get_drag_data(Vector2.ZERO)
	_expect(drag_data == { "hero_instance_id": "hero-a", "origin": 0 }, "a filled formation slot must provide an authoritative drag payload")
	_expect(destination._can_drop_data(Vector2.ZERO, drag_data), "an empty enabled formation slot must accept a different hero drag")
	_expect(destination.is_drop_highlighted(), "a legal drop target must show a visible highlight")
	destination._drop_data(Vector2.ZERO, drag_data)
	_expect(dropped == [{ "hero": "hero-a", "destination": 12 }], "drop must emit a move to the destination rather than mutate local state")
	_expect(not destination._can_drop_data(Vector2.ZERO, { "hero_instance_id": "hero-a", "origin": 12 }), "a source slot cannot drop onto itself")
	_expect(not destination.is_drop_highlighted(), "an invalid drop target must clear its highlight")
	var empty_source = FormationSlotButtonScript.new()
	empty_source.configure_slot("", 1, true)
	_expect(empty_source._get_drag_data(Vector2.ZERO) == null, "an empty slot must not create a drag ghost")
	source.free()
	destination.free()
	empty_source.free()
	if _failed:
		quit(1)
		return
	print("PASS formation_slot_button_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
