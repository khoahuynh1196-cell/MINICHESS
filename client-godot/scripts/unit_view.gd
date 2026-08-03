extends Node2D

const CELL_WIDTH := 340.0
const CELL_HEIGHT := 130.0
const HERO_PORTRAITS := {
	"H01": preload("res://assets/sprites/h01-cotton-shield-cat-chibi-v2.png"),
	"H02": preload("res://assets/sprites/h02-ember-duelist-cat-chibi-v2.png"),
	"H03": preload("res://assets/sprites/h03-forest-ranger-cat-chibi-v2.png"),
	"H04": preload("res://assets/sprites/h04-frost-mage-cat-chibi-v2.png"),
	"H05": preload("res://assets/sprites/h05-lantern-healer-cat-chibi-v2.png"),
	"H06": preload("res://assets/sprites/h06-moonshield-dog-chibi-v2.png"),
	"H07": preload("res://assets/sprites/h07-scarf-brawler-dog-chibi-v2.png"),
	"H08": preload("res://assets/sprites/h08-hooded-ranger-dog-chibi-v2.png"),
	"H09": preload("res://assets/sprites/h09-star-mage-dog-chibi-v2.png"),
	"H10": preload("res://assets/sprites/h10-medic-dog-chibi-v2.png"),
	"H11": preload("res://assets/sprites/h11-dashing-rabbit-fighter-chibi-v2.png"),
	"H12": preload("res://assets/sprites/h12-hooded-rabbit-ranger-chibi-v2.png"),
	"H13": preload("res://assets/sprites/h13-potion-rabbit-mage-chibi-v2.png"),
	"H14": preload("res://assets/sprites/h14-rabbit-healer-chibi-v2.png"),
	"H15": preload("res://assets/sprites/h15-bulwark-cow-chibi-v2.png"),
	"H16": preload("res://assets/sprites/h16-hammer-cow-fighter-chibi-v2.png"),
	"H17": preload("res://assets/sprites/h17-lantern-cow-support-chibi-v2.png"),
	"H18": preload("res://assets/sprites/h18-red-panda-ranger-chibi-v2.png"),
	"H19": preload("res://assets/sprites/h19-owl-mage-chibi-v2.png"),
	"H20": preload("res://assets/sprites/h20-capybara-guardian-chibi-v3.png"),
}

var grid_index := 0
var hp := 100000
var max_hp := 100000
var side := "player"
var is_defeated := false
var animation_state := "idle"
var portrait: Sprite2D
var unique_item_id := ""
var _animation_elapsed := 0.0

const UNIQUE_VISUALS := {
	"U01": { "color": Color("#f9c74f"), "anchor": Vector2(0.0, -66.0) },
	"U02": { "color": Color("#e5e7eb"), "anchor": Vector2(44.0, -8.0) },
	"U03": { "color": Color("#4cc9f0"), "anchor": Vector2(34.0, 12.0) },
	"U04": { "color": Color("#c77dff"), "anchor": Vector2(0.0, -62.0) },
	"U05": { "color": Color("#ff70a6"), "anchor": Vector2(-34.0, -20.0) },
	"U06": { "color": Color("#ff6b35"), "anchor": Vector2(28.0, 12.0) },
}

const UNIQUE_ACCESSORIES := {
	"U01": preload("res://assets/transformations/u01-lion-crown-v1.png"),
	"U02": preload("res://assets/transformations/u02-white-wolf-claw-v1.png"),
	"U03": preload("res://assets/transformations/u03-turtle-shell-v1.png"),
	"U04": preload("res://assets/transformations/u04-unicorn-horn-v1.png"),
	"U05": preload("res://assets/transformations/u05-fox-mask-v1.png"),
	"U06": preload("res://assets/transformations/u06-phoenix-feather-v1.png"),
}

func configure(unit_side: String, position_index: int, unit_max_hp: int, hero_id: String = "", equipped_unique_item_id: String = "") -> void:
	side = unit_side
	grid_index = position_index
	max_hp = max(1, unit_max_hp)
	hp = max_hp
	unique_item_id = equipped_unique_item_id
	_add_portrait(hero_id)
	_add_unique_accessory()
	_update_position()
	queue_redraw()

func _process(delta: float) -> void:
	_animation_elapsed += delta
	if portrait == null:
		return
	if animation_state == "idle":
		portrait.position.y = -5.0 + sin(_animation_elapsed * 4.0) * 2.0
		return
	if animation_state != "death" and _animation_elapsed >= 0.18:
		present("idle")

func _add_portrait(hero_id: String) -> void:
	if not HERO_PORTRAITS.has(hero_id):
		return
	portrait = Sprite2D.new()
	portrait.name = "Portrait"
	portrait.texture = HERO_PORTRAITS[hero_id]
	portrait.position = Vector2(0.0, -5.0)
	portrait.scale = Vector2(0.055, 0.055)
	portrait.z_index = 1
	add_child(portrait)

func _add_unique_accessory() -> void:
	if not UNIQUE_ACCESSORIES.has(unique_item_id):
		return
	var accessory := Sprite2D.new()
	accessory.name = "UniqueAccessory"
	accessory.texture = UNIQUE_ACCESSORIES[unique_item_id]
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
