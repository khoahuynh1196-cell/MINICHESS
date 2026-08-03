extends Node2D

const HeroRigScript = preload("res://scripts/presentation/hero_rig_2d.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const CELL_WIDTH := 340.0
const CELL_HEIGHT := 130.0

var grid_index := 0
var hp := 100000
var max_hp := 100000
var side := "player"
var is_defeated := false
var animation_state := "idle"
var portrait: Sprite2D
var hero_rig
var hero_id := ""
var unique_item_id := ""
var _animation_elapsed := 0.0
var reduced_motion := false

const UNIQUE_VISUALS := {
	"U01": { "color": Color("#f9c74f"), "anchor": Vector2(0.0, -66.0) },
	"U02": { "color": Color("#e5e7eb"), "anchor": Vector2(44.0, -8.0) },
	"U03": { "color": Color("#4cc9f0"), "anchor": Vector2(34.0, 12.0) },
	"U04": { "color": Color("#c77dff"), "anchor": Vector2(0.0, -62.0) },
	"U05": { "color": Color("#ff70a6"), "anchor": Vector2(-34.0, -20.0) },
	"U06": { "color": Color("#ff6b35"), "anchor": Vector2(28.0, 12.0) },
}

func configure(unit_side: String, position_index: int, unit_max_hp: int, hero_id: String = "", equipped_unique_item_id: String = "") -> void:
	side = unit_side
	grid_index = position_index
	max_hp = max(1, unit_max_hp)
	hp = max_hp
	self.hero_id = hero_id
	unique_item_id = equipped_unique_item_id
	_add_portrait(hero_id)
	_add_unique_accessory()
	_update_position()
	queue_redraw()

func set_reduced_motion(enabled: bool) -> void:
	reduced_motion = enabled
	if hero_rig != null:
		hero_rig.set_reduced_motion(enabled)

func _process(delta: float) -> void:
	_animation_elapsed += delta
	if animation_state != "death" and animation_state != "idle" and _animation_elapsed >= 0.18:
		present("idle")
	if hero_rig != null or portrait == null:
		return
	if animation_state == "idle":
		portrait.position.y = -5.0 + sin(_animation_elapsed * 4.0) * 2.0

func _add_portrait(hero_id: String) -> void:
	var manifest_texture := AssetManifestScript.resolve_hero_texture(hero_id)
	if manifest_texture == null:
		return
	portrait = Sprite2D.new()
	portrait.name = "Portrait"
	portrait.texture = manifest_texture
	portrait.position = Vector2(0.0, -5.0)
	portrait.scale = Vector2(0.055, 0.055)
	portrait.z_index = 1
	add_child(portrait)
	hero_rig = HeroRigScript.new()
	hero_rig.name = "HeroRig"
	hero_rig.z_index = 2
	hero_rig.configure(hero_id, manifest_texture, side == "player")
	hero_rig.set_reduced_motion(reduced_motion)
	add_child(hero_rig)
	# Retain the named texture node for fixture compatibility; the rig is visible.
	portrait.visible = false

func _add_unique_accessory() -> void:
	if not UNIQUE_VISUALS.has(unique_item_id):
		return
	var manifest_texture := AssetManifestScript.resolve_transformation_texture(unique_item_id)
	if manifest_texture == null:
		return
	var accessory := Sprite2D.new()
	accessory.name = "UniqueAccessory"
	accessory.texture = manifest_texture
	accessory.position = UNIQUE_VISUALS[unique_item_id].anchor
	accessory.scale = Vector2(0.14, 0.14)
	accessory.z_index = 2
	add_child(accessory)

func move_to(position_index: int) -> void:
	grid_index = position_index
	_update_position()
	present("move")

func set_hp(next_hp: int) -> void:
	hp = clampi(next_hp, 0, max_hp)
	is_defeated = hp == 0
	if is_defeated:
		present("death")
	queue_redraw()

func present(next_animation_state: String) -> void:
	if is_defeated and next_animation_state != "death":
		return
	animation_state = next_animation_state
	_animation_elapsed = 0.0
	if hero_rig != null:
		var rig_action: String = String({
			"basic_attack": "basic_attack",
			"hit": "hit",
			"skill": "skill_cast",
			"move": "move",
			"death": "death",
		}.get(animation_state, "idle"))
		hero_rig.play_action(rig_action)
		queue_redraw()
		return
	if portrait == null:
		queue_redraw()
		return
	portrait.scale = Vector2(0.055, 0.055)
	portrait.rotation = 0.0
	portrait.modulate = Color.WHITE
	match animation_state:
		"move":
			portrait.position = Vector2(0.0, -12.0)
		"basic_attack":
			portrait.rotation = -0.12 if side == "player" else 0.12
			portrait.scale = Vector2(0.06, 0.06)
		"hit":
			portrait.modulate = Color("#ff9b9b")
		"skill":
			portrait.modulate = Color("#d9b8ff")
			portrait.scale = Vector2(0.062, 0.062)
		"death":
			portrait.modulate = Color("#596275")
			portrait.scale = Vector2(0.045, 0.045)
		_:
			portrait.position = Vector2(0.0, -5.0)
	queue_redraw()

func _update_position() -> void:
	position = Vector2((grid_index % 3 + 0.5) * CELL_WIDTH, (grid_index / 3 + 0.5) * CELL_HEIGHT)

func _draw() -> void:
	var body_color := Color("#e76f51") if side == "enemy" else Color("#4cc9f0")
	if is_defeated:
		body_color = Color("#4a4e69")
	draw_circle(Vector2.ZERO, 44.0, body_color)
	if UNIQUE_VISUALS.has(unique_item_id):
		var visual: Dictionary = UNIQUE_VISUALS[unique_item_id]
		var color: Color = visual.color
		var anchor: Vector2 = visual.anchor
		draw_arc(Vector2.ZERO, 53.0, 0.0, TAU, 32, Color(color, 0.45), 3.0)
		draw_circle(anchor, 10.0, color)
		draw_circle(anchor, 5.0, Color.WHITE)
	draw_rect(Rect2(-52.0, 58.0, 104.0, 10.0), Color("#202438"), true)
	draw_rect(Rect2(-52.0, 58.0, 104.0 * float(hp) / max_hp, 10.0), Color("#8ac926"), true)
	if not hero_id.is_empty():
		draw_string(ThemeDB.fallback_font, Vector2(-32.0, -66.0), hero_id, HORIZONTAL_ALIGNMENT_CENTER, 64.0, 16, Color.WHITE)
