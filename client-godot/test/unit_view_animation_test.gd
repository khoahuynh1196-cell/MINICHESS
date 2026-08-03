extends SceneTree

const UnitViewScript = preload("res://scripts/unit_view.gd")

func _init() -> void:
	var unit = UnitViewScript.new()
	unit.configure("player", 12, 100000, "H01")
	unit.present("basic_attack")
	unit._process(0.25)
	if unit.animation_state != "idle":
		push_error("transient basic attack animation must return to idle")
		quit(1)
		return
	unit.free()
	print("PASS unit_view_animation_test")
	quit(0)
