extends SceneTree

const Catalog = preload("res://scripts/presentation/hero_visual_catalog.gd")
const HeroRig = preload("res://scripts/presentation/hero_rig_2d.gd")

func _init() -> void:
	var hero_ids := Catalog.hero_ids()
	_expect(hero_ids.size() == 20, "the asset pack must define all twenty heroes")
	for hero_id in hero_ids:
		var profile: Dictionary = Catalog.profile(hero_id)
		_expect(profile.required_layers.size() == 8, "%s must declare its cutout art layers" % hero_id)
		_expect(profile.animations.size() == 6, "%s must declare the six replay animations" % hero_id)
		_expect(not String(profile.weapon.style).is_empty(), "%s must define a weapon rig" % hero_id)
		_expect(not String(profile.vfx.skill_cast).is_empty(), "%s must define a skill VFX" % hero_id)
		_expect(not String(profile.sfx.skill_cast).is_empty(), "%s must define a skill SFX" % hero_id)
		var rig := HeroRig.new()
		rig.configure(hero_id)
		_expect(rig.get_node_or_null("Skeleton/Weapon/WeaponMesh") != null, "%s must build a weapon attachment" % hero_id)
		rig.play_action("skill_cast")
		_expect(rig.animation_state == "skill_cast", "%s must enter the skill pose" % hero_id)
		rig.free()
	if bool(get_meta("failed", false)):
		quit(1)
		return
	print("PASS hero_asset_runtime_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	set_meta("failed", true)
	push_error(message)
