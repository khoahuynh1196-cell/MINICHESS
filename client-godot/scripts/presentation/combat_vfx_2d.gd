class_name CombatVfx2D
extends Node2D

var cue_id := "attack_flash"
var color := Color.WHITE
var duration := 0.28
var age := 0.0
var direction := 1.0

func play(next_cue_id: String, next_color: Color, next_direction: float = 1.0) -> void:
	cue_id = next_cue_id
	color = next_color
	direction = signf(next_direction) if not is_zero_approx(next_direction) else 1.0
	duration = 0.48 if cue_id in ["barrier", "moon_barrier", "shell_bastion", "earth_decoy"] else 0.28
	age = 0.0
	queue_redraw()

func _process(delta: float) -> void:
	age += delta
	if age >= duration:
		queue_free()
		return
	queue_redraw()

func _draw() -> void:
	var t := clampf(age / duration, 0.0, 1.0)
	var fade := 1.0 - t
	var glow := Color(color.r, color.g, color.b, fade * 0.78)
	match cue_id:
		"attack_flash", "hit_spark", "bramble_impact", "horn_shock":
			for index in 5:
				var angle := TAU * float(index) / 5.0 + t * 1.8
				var start := Vector2(cos(angle), sin(angle)) * (12.0 + 18.0 * t)
				var ending := start + Vector2(cos(angle), sin(angle)) * 18.0
				draw_line(start, ending, glow, 3.0)
		"barrier", "moon_barrier", "shell_bastion", "earth_decoy", "moon_ward":
			draw_arc(Vector2.ZERO, 30.0 + 20.0 * t, 0.0, TAU, 28, glow, 3.0, true)
			draw_circle(Vector2.ZERO, 12.0 + 10.0 * t, Color(color.r, color.g, color.b, fade * 0.12))
		"heal_bloom", "remedy_bloom", "purify_bloom":
			for index in 6:
				var angle := TAU * float(index) / 6.0 - t * 2.0
				draw_circle(Vector2(cos(angle), sin(angle)) * (16.0 + t * 22.0), 5.0 * fade + 1.0, glow)
		"leaf_arrow", "focus_mark", "thistle_volley", "ricochet":
			var travel := Vector2(direction * (20.0 + 58.0 * t), -12.0 * sin(t * PI))
			draw_line(Vector2.ZERO, travel, glow, 3.0)
			draw_circle(travel, 5.0, glow)
		"frost_wave", "star_arc", "prismatic_burst", "spore_cloud":
			for index in 4:
				var offset := Vector2(direction * (10.0 + index * 13.0), sin(t * TAU + index) * 13.0)
				draw_circle(offset, 9.0 * fade + 2.0, Color(color.r, color.g, color.b, fade * (0.45 + 0.1 * index)))
		"dash", "burrow_dash":
			draw_line(Vector2(-direction * 60.0 * fade, 0.0), Vector2(direction * 22.0, 0.0), glow, 5.0)
		_:
			draw_circle(Vector2.ZERO, 14.0 + 24.0 * t, glow)
