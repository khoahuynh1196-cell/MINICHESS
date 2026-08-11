extends SceneTree

const UnitViewScript = preload("res://scripts/unit_view.gd")

var _failed := false

func _init() -> void:
	var unit = UnitViewScript.new()
	unit.configure("player", 16, 100000, "H01")
	unit.present("skill")
	unit.present("move")
	_expect(unit.animation_state == "skill", "move must not overwrite an active cast")
	unit.present("control")
	_expect(unit.animation_state == "control", "hard control must interrupt a cast")
	unit.present("skill")
	_expect(unit.animation_state == "control", "cast must not overwrite hard control")
	var rig = unit.hero_rig
	rig.play_action("idle")
	rig.play_action("skill_cast")
	rig.play_action("move")
	_expect(rig.animation_state == "skill_cast", "rig move must not overwrite an active cast")
	rig.play_action("control")
	_expect(rig.animation_state == "control", "rig hard control must interrupt a cast")
	rig.play_action("skill_cast")
	_expect(rig.animation_state == "control", "rig cast must not overwrite hard control")
	rig.play_action("death")
	rig.play_action("idle")
	_expect(rig.animation_state == "death", "rig death must remain terminal")
	unit.present("death")
	unit.present("idle")
	_expect(unit.animation_state == "death", "death must remain terminal for presentation")
	unit.free()
	if _failed:
		quit(1)
		return
	print("PASS animation_priority_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
