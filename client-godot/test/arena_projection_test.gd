extends SceneTree

const ArenaProjectionScript = preload("res://scripts/presentation/arena_projection.gd")

var _failed := false

func _init() -> void:
	_expect(ArenaProjectionScript.COLUMNS == 4 and ArenaProjectionScript.ROWS == 6, "arena projection must expose a 4x6 board")
	_expect(ArenaProjectionScript.PLAYER_START == 12 and ArenaProjectionScript.CELL_COUNT == 24, "arena projection must split 24 cells into two 12-cell halves")
	_expect(ArenaProjectionScript.board_rect().end.y <= 920.0, "the 4x6 board must end early enough to reserve a portrait footer for shop and primary actions")
	_expect(ArenaProjectionScript.ui_bottom() <= 920.0, "arena projection footer must remain below the board and above the mobile action rail")
	var centers: Array[Vector2] = []
	for index in range(ArenaProjectionScript.CELL_COUNT):
		var center: Vector2 = ArenaProjectionScript.cell_center(index)
		centers.append(center)
		_expect(ArenaProjectionScript.board_rect().has_point(center), "cell %d must remain inside the portrait board frame" % index)
	_expect(centers[0].x < centers[3].x and centers[20].x < centers[23].x, "each row must retain four ordered columns")
	_expect(centers[12].y < centers[20].y, "player rows must occupy the lower half")
	_expect(ArenaProjectionScript.cell_polygon(0).size() == 4 and ArenaProjectionScript.cell_polygon(23).size() == 4, "every cell must have a quadrilateral perspective footprint")
	_expect(ArenaProjectionScript.texture_scale().x > 0.0 and ArenaProjectionScript.texture_scale().y > 0.0, "arena texture scale must be positive")
	if _failed:
		quit(1)
		return
	print("PASS arena_projection_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
