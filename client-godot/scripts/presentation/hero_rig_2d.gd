class_name HeroRig2D
extends Node2D

const Catalog = preload("res://scripts/presentation/hero_visual_catalog.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const CombatVfx = preload("res://scripts/presentation/combat_vfx_2d.gd")
const WeaponSilhouette = preload("res://scripts/presentation/weapon_silhouette_2d.gd")
const HeroSfx = preload("res://scripts/presentation/hero_sfx_bus.gd")

signal action_finished(action: String)

var hero_id := "H01"
var profile: Dictionary = {}
var animation_state := "idle"
var facing := 1.0
var action_elapsed := 0.0
var action_duration := 0.0
var skeleton: Bone2D
var body_anchor: Bone2D
var weapon_anchor: Bone2D
var body_sprite: Sprite2D
var weapon_mesh: WeaponSilhouette2D
var anchors: Dictionary = {}
var layered_parts: Dictionary = {}
var reduced_motion := false

func configure(next_hero_id: String, base_texture: Texture2D = null, faces_right: bool = true) -> void:
	hero_id = next_hero_id
	profile = Catalog.profile(hero_id)
	facing = 1.0 if faces_right else -1.0
	if base_texture == null:
		base_texture = load(Catalog.source_asset_path(hero_id)) as Texture2D
	_clear_rig()
	_build_skeleton()
	_add_preview_body(base_texture)
	_add_weapon()
	reset_pose()

func set_reduced_motion(enabled: bool) -> void:
	reduced_motion = enabled
	if reduced_motion:
		reset_pose()

func set_layer_texture(layer_id: String, texture: Texture2D, anchor_name: String = "Chest") -> void:
	if texture == null:
		return
	var parent: Node2D = anchors.get(anchor_name, body_anchor)
	var part: Sprite2D = layered_parts.get(layer_id)
	if part == null:
		part = Sprite2D.new()
		part.name = layer_id.capitalize()
		part.z_index = 3 if layer_id in ["arm_front", "weapon", "fx_mask"] else 1
		parent.add_child(part)
		layered_parts[layer_id] = part
	part.texture = texture
	part.scale = Vector2(0.055, 0.055)

func play_action(next_action: String) -> void:
	if animation_state == "death" and next_action != "death":
		return
	animation_state = next_action
	action_elapsed = 0.0
	action_duration = _duration_for(next_action)
	if not reduced_motion:
		_spawn_vfx(String(profile.vfx.get(next_action, "attack_flash")))
	if next_action != "idle":
		HeroSfx.play_cue(self, String(profile.sfx.get(next_action, "magic")))

func trigger_from_combat_event(event_type: String) -> void:
	match event_type:
		"UNIT_MOVED", "UNIT_DISPLACED": play_action("move")
		"BASIC_ATTACK": play_action("basic_attack")
		"CAST_STARTED", "CAST_RESOLVED": play_action("skill_cast")
		"DAMAGE_APPLIED", "STUN_APPLIED", "SLOW_APPLIED": play_action("hit")
		"UNIT_DIED": play_action("death")

func reset_pose() -> void:
	rotation = 0.0
	scale = Vector2.ONE
	if body_anchor != null:
		body_anchor.position = Vector2.ZERO
		body_anchor.rotation = 0.0
		body_anchor.scale = Vector2.ONE
	if weapon_anchor != null:
		weapon_anchor.rotation = 0.0
		weapon_anchor.position = Vector2(profile.anchors.get("Weapon", Vector2(31.0, -18.0)))
	if body_sprite != null:
		body_sprite.modulate = Color.WHITE

func _process(delta: float) -> void:
	if skeleton == null:
		return
	if animation_state == "idle":
		body_anchor.position.y = 0.0 if reduced_motion else sin(Time.get_ticks_msec() * 0.004) * 2.0
		return
	action_elapsed += delta
	var t := clampf(action_elapsed / action_duration, 0.0, 1.0)
	_apply_pose(t)
	if action_elapsed >= action_duration and animation_state != "death":
		var completed := animation_state
		animation_state = "idle"
		reset_pose()
		action_finished.emit(completed)

func _clear_rig() -> void:
	for child in get_children():
		child.queue_free()
	anchors.clear()
	layered_parts.clear()
	skeleton = null
	body_anchor = null
	weapon_anchor = null
	body_sprite = null
	weapon_mesh = null

func _build_skeleton() -> void:
	skeleton = _bone("Skeleton", Vector2.ZERO, self)
	body_anchor = _bone("Body", Vector2.ZERO, skeleton)
	for anchor_name in profile.anchors:
		anchors[anchor_name] = _bone(anchor_name, Vector2(profile.anchors[anchor_name]), skeleton)
	weapon_anchor = anchors["Weapon"]

func _add_preview_body(base_texture: Texture2D) -> void:
	body_sprite = Sprite2D.new()
	body_sprite.name = "PreviewBody"
	body_sprite.texture = base_texture
	body_sprite.position = Vector2(0.0, -5.0)
	body_sprite.scale = Vector2(0.055, 0.055)
	body_sprite.z_index = 1
	body_anchor.add_child(body_sprite)

func _add_weapon() -> void:
	weapon_mesh = WeaponSilhouette.new()
	weapon_mesh.name = "WeaponMesh"
	var weapon: Dictionary = profile.weapon
	weapon_mesh.configure(String(weapon.style), Color.from_string(String(weapon.color), Color.WHITE))
	weapon_mesh.z_index = 4
	weapon_anchor.add_child(weapon_mesh)

func _spawn_vfx(cue_id: String) -> void:
	if cue_id == "":
		return
	var vfx := CombatVfx.new()
	vfx.name = "Vfx_%s" % cue_id
	vfx.z_index = 8
	var palette: Dictionary = profile.palette
	vfx.play(cue_id, Color.from_string(String(palette.accent), Color.WHITE), facing, AssetManifestScript.resolve_vfx_texture("transformations/lion_crown/vfx"))
	add_child(vfx)

func _apply_pose(t: float) -> void:
	reset_pose()
	if reduced_motion and animation_state != "death":
		return
	var direction := facing
	match animation_state:
		"move":
			body_anchor.position = Vector2(direction * sin(t * PI) * 8.0, -abs(sin(t * PI * 2.0)) * 7.0)
			body_anchor.rotation = direction * sin(t * PI * 2.0) * 0.08
		"basic_attack":
			_apply_attack_motion(String(profile.motion.basic_attack), t, direction)
		"skill_cast":
			_apply_skill_motion(String(profile.motion.skill_cast), t, direction)
		"hit":
			body_anchor.position.x = -direction * sin(t * PI) * 8.0
			body_sprite.modulate = Color.from_string(String(profile.palette.hit), Color.WHITE)
		"death":
			body_anchor.rotation = direction * 1.28
			body_anchor.position.y = 24.0
			body_sprite.modulate = Color.from_string(String(profile.palette.death), Color.GRAY)

func _apply_attack_motion(motion: String, t: float, direction: float) -> void:
	var windup := sin(t * PI)
	match motion:
		"slash", "smash", "swing":
			body_anchor.rotation = -direction * windup * 0.12
			weapon_anchor.rotation = direction * lerpf(-0.75, 1.05, t)
		"thrust", "punch":
			weapon_anchor.position.x += direction * windup * 20.0
			body_anchor.position.x += direction * windup * 5.0
		"shot", "throw":
			weapon_anchor.rotation = direction * lerpf(-0.18, 0.34, t)
			body_anchor.position.x -= direction * windup * 4.0
		"guard":
			weapon_anchor.position.x += direction * 10.0
			weapon_anchor.rotation = direction * -0.18
		_:
			weapon_anchor.rotation = direction * windup * 0.4

func _apply_skill_motion(motion: String, t: float, direction: float) -> void:
	var pulse := sin(t * PI)
	if motion in ["dash", "burrow_dash"]:
		body_anchor.position.x = direction * pulse * 24.0
		body_anchor.position.y = -pulse * 8.0
		return
	if motion in ["barrier", "moon_barrier", "shell_bastion", "earth_decoy", "moon_ward"]:
		weapon_anchor.position.x += direction * 13.0
		body_anchor.scale = Vector2(1.0 + pulse * 0.08, 1.0 - pulse * 0.05)
		return
	weapon_anchor.rotation = direction * pulse * 0.45
	body_anchor.position.y = -pulse * 7.0
	body_anchor.scale = Vector2.ONE * (1.0 + pulse * 0.06)

func _duration_for(action: String) -> float:
	return {
		"idle": 0.0,
		"move": 0.28,
		"basic_attack": 0.34,
		"skill_cast": 0.52,
		"hit": 0.18,
		"death": 0.65,
	}.get(action, 0.28)

func _bone(node_name: String, node_position: Vector2, parent: Node) -> Bone2D:
	var bone := Bone2D.new()
	bone.name = node_name
	bone.position = node_position
	parent.add_child(bone)
	return bone
