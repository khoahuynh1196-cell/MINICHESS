extends SceneTree

const UnitViewScript = preload("res://scripts/unit_view.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")

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
	var transformed_unit = UnitViewScript.new()
	transformed_unit.configure("player", 13, 100000, "H01", "U01")
	var accessory = transformed_unit.get_node_or_null("UniqueAccessory")
	var manifest_accessory := AssetManifestScript.resolve_transformation_texture("U01")
	var accessory_atlas := accessory.texture as AtlasTexture if accessory != null else null
	var manifest_atlas := manifest_accessory as AtlasTexture
	if accessory_atlas == null or manifest_atlas == null or accessory_atlas.atlas.resource_path != manifest_atlas.atlas.resource_path or accessory_atlas.region != manifest_atlas.region:
		push_error("Unique accessory art must be resolved through the manifest")
		quit(1)
		return
	transformed_unit.free()
	print("PASS unit_view_animation_test")
	quit(0)
