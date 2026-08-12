class_name MonsterView
extends Node2D

const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const ArenaProjectionScript = preload("res://scripts/presentation/arena_projection.gd")

var monster_id := "meadow"
var display_name := "Monster"
var tier := "normal"
var grid_index := 0
var hp := 1
var max_hp := 1
var is_defeated := false
var cutout: Sprite2D
var animation_state := "idle"
var _elapsed := 0.0
var reduced_motion := false

func configure(next_monster_id: String, unit_max_hp: int, position_index: int, next_display_name: String = "") -> void:
	monster_id = next_monster_id
	max_hp = max(1, unit_max_hp)
	hp = max_hp
	grid_index = position_index
	var texture := AssetManifestScript.resolve_monster_texture(monster_id)
	if texture == null:
		return
	cutout = Sprite2D.new()
	cutout.name = "Cutout"
	cutout.texture = texture
	cutout.position = Vector2(0.0, -8.0)
	cutout.scale = Vector2(0.055, 0.055)
	cutout.z_index = 2
	add_child(cutout)
	var manifest: Dictionary = AssetManifestScript.load_manifest()
	var record: Dictionary = manifest.get("monsters", {}).get(monster_id, {})
	display_name = next_display_name if not next_display_name.is_empty() else String(record.get("display_name", monster_id.capitalize()))
	tier = String(record.get("tier", "normal"))
	_update_position()
	queue_redraw()

func set_reduced_motion(enabled: bool) -> void:
	reduced_motion = enabled

func move_to(position_index: int) -> void:
	grid_index = position_index
	_update_position()
	present("move")

func set_hp(next_hp: int) -> void:
	hp = clampi(next_hp, 0, max_hp)
	is_defeated = hp == 0
	present("death" if is_defeated else "hit")
	queue_redraw()

func present(next_animation_state: String) -> void:
	animation_state = next_animation_state
	_elapsed = 0.0
	if cutout == null:
		return
	cutout.modulate = Color("#64748b") if is_defeated else Color.WHITE
	queue_redraw()

func _process(delta: float) -> void:
	_elapsed += delta
	if cutout != null and not reduced_motion and not is_defeated:
		cutout.position.y = -8.0 + sin(_elapsed * 3.5) * 2.0

func _update_position() -> void:
	position = ArenaProjectionScript.cell_center(grid_index)

func _draw() -> void:
	# Ground, HP, and identity are engine-owned so combat state never lives in the art.
	_draw_ground_ellipse(Vector2(0.0, 39.0), 44.0, 11.0, Color(0.04, 0.05, 0.08, 0.42))
	draw_rect(Rect2(-52.0, 58.0, 104.0, 10.0), Color("#202438"), true)
	draw_rect(Rect2(-52.0, 58.0, 104.0 * float(hp) / max_hp, 10.0), Color("#ef4444"), true)
	draw_string(ThemeDB.fallback_font, Vector2(-62.0, -66.0), display_name, HORIZONTAL_ALIGNMENT_CENTER, 124.0, 14, Color.WHITE)
	if tier == "elite":
		draw_colored_polygon(PackedVector2Array([Vector2(0, -56), Vector2(9, -47), Vector2(0, -38), Vector2(-9, -47)]), Color("#facc15"))
	elif tier == "boss" or tier == "boss_family":
		draw_circle(Vector2(0, -48), 11.0, Color("#fb7185") if tier == "boss" else Color("#a78bfa"))

func _draw_ground_ellipse(center: Vector2, radius_x: float, radius_y: float, color: Color) -> void:
	var points := PackedVector2Array()
	for index in 24:
		var angle := TAU * float(index) / 24.0
		points.append(center + Vector2(cos(angle) * radius_x, sin(angle) * radius_y))
	draw_colored_polygon(points, color)
