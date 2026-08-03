extends SceneTree

const UnitViewScript = preload("res://scripts/unit_view.gd")

func _init() -> void:
	var unit = UnitViewScript.new()
	unit.configure("player", 12, 100000, "H01")
	if unit.hero_rig == null or unit.hero_rig.get_node_or_null("Skeleton/Weapon/WeaponMesh") == null:
		push_error("a supplied portrait texture must still build the rig")
		quit(1)
		return
	unit.set_reduced_motion(true)
	if not unit.hero_rig.reduced_motion:
		push_error("reduced-motion settings must reach the rig")
		quit(1)
		return
	unit.present("basic_attack")
	unit._process(0.25)
	if unit.animation_state != "idle":
		push_error("transient basic attack animation must return to idle")
		quit(1)
		return
	unit.free()
	print("PASS unit_view_animation_test")
	quit(0)
