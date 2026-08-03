class_name WeaponSilhouette2D
extends Node2D

var style := "sword"
var color := Color.WHITE

func configure(next_style: String, next_color: Color) -> void:
	style = next_style
	color = next_color
	queue_redraw()

func _draw() -> void:
	var dark := color.darkened(0.45)
	match style:
		"shield", "tower_shield", "shell":
			draw_circle(Vector2(12.0, 0.0), 15.0 if style != "tower_shield" else 21.0, dark)
			draw_circle(Vector2(12.0, 0.0), 11.0 if style != "tower_shield" else 16.0, color)
			draw_circle(Vector2(12.0, 0.0), 4.0, Color.WHITE)
		"sword", "spear", "staff", "wand":
			var length := 42.0 if style == "spear" else 32.0
			draw_line(Vector2.ZERO, Vector2(length, -length * 0.45), dark, 7.0)
			draw_line(Vector2.ZERO, Vector2(length, -length * 0.45), color, 4.0)
			draw_circle(Vector2.ZERO, 5.0, Color("#553b2d"))
		"bow", "crossbow":
			draw_arc(Vector2(8.0, 0.0), 20.0, -1.1, 1.1, 12, color, 4.0, true)
			draw_line(Vector2(-1.0, -18.0), Vector2(-1.0, 18.0), Color.WHITE, 1.0)
		"hammer":
			draw_line(Vector2.ZERO, Vector2(26.0, -20.0), Color("#704e36"), 6.0)
			draw_rect(Rect2(16.0, -33.0, 24.0, 14.0), color, true)
		"chakram":
			draw_arc(Vector2(14.0, -8.0), 14.0, 0.0, TAU, 18, color, 5.0, true)
		"lantern", "flask", "satchel", "tome":
			draw_rect(Rect2(2.0, -17.0, 22.0, 24.0), dark, true)
			draw_rect(Rect2(5.0, -14.0, 16.0, 18.0), color, true)
			draw_circle(Vector2(13.0, -5.0), 4.0, Color.WHITE)
		"fists":
			draw_circle(Vector2(16.0, -5.0), 11.0, color)
			for index in 3:
				draw_line(Vector2(8.0 + index * 5.0, -12.0), Vector2(8.0 + index * 5.0, 1.0), dark, 2.0)
		_:
			draw_circle(Vector2(8.0, 0.0), 10.0, color)
