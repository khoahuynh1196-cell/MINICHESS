extends SceneTree

func _init() -> void:
	_expect(ResourceLoader.exists("res://scripts/presentation/monster_view.gd"), "the reusable MonsterView implementation must exist")
	if bool(get_meta("failed", false)):
		quit(1)
		return
	var monster_script = load("res://scripts/presentation/monster_view.gd")
	var view = monster_script.new()
	view.configure("meadow", 120, 200, "Moss Scout")
	_expect(view.get_node_or_null("Cutout") != null, "monster view must add a manifest-backed cutout sprite")
	_expect(view.get_node_or_null("Cutout").texture != null, "monster view must assign the resolved monster texture")
	_expect(view.get_node_or_null("Cutout").texture.resource_path.find("monster-hud-vfx-atlas-v2") == -1, "monster view must not use the rejected card atlas")
	view.set_hp(80)
	_expect(view.hp == 80, "monster HP must be engine-owned and updateable")
	view.free()
	var boss_view = monster_script.new()
	boss_view.configure("frost_keep_boss", 300, 201)
	_expect(boss_view.tier == "boss", "variant records must drive an engine-owned boss marker")
	boss_view.free()
	if bool(get_meta("failed", false)):
		quit(1)
		return
	print("PASS monster_view_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	set_meta("failed", true)
	push_error(message)
