class_name ArenaProjection
extends RefCounted

const COLUMNS := 4
const ROWS := 6
const CELL_COUNT := COLUMNS * ROWS
const PLAYER_START := CELL_COUNT / 2
const BOARD_TOP_LEFT := Vector2(226.0, 188.0)
const BOARD_TOP_RIGHT := Vector2(854.0, 188.0)
const BOARD_BOTTOM_LEFT := Vector2(164.0, 804.0)
const BOARD_BOTTOM_RIGHT := Vector2(916.0, 804.0)
const TEXTURE_CENTER := Vector2(540.0, 500.0)
const TEXTURE_SIZE := Vector2(880.0, 760.0)

static func _edge_at(row_fraction: float, left: bool) -> Vector2:
	var start := BOARD_TOP_LEFT if left else BOARD_TOP_RIGHT
	var finish := BOARD_BOTTOM_LEFT if left else BOARD_BOTTOM_RIGHT
	return start.lerp(finish, clampf(row_fraction, 0.0, 1.0))

static func row_corners(row: int) -> PackedVector2Array:
	var top_left := _edge_at(float(row) / ROWS, true)
	var top_right := _edge_at(float(row) / ROWS, false)
	var bottom_left := _edge_at(float(row + 1) / ROWS, true)
	var bottom_right := _edge_at(float(row + 1) / ROWS, false)
	return PackedVector2Array([top_left, top_right, bottom_right, bottom_left])

static func cell_center(index: int) -> Vector2:
	if index < 0 or index >= CELL_COUNT:
		return TEXTURE_CENTER
	var row := index / COLUMNS
	var column := index % COLUMNS
	var top_left := _edge_at(float(row) / ROWS, true)
	var top_right := _edge_at(float(row) / ROWS, false)
	var bottom_left := _edge_at(float(row + 1) / ROWS, true)
	var bottom_right := _edge_at(float(row + 1) / ROWS, false)
	var top := top_left.lerp(top_right, (float(column) + 0.5) / COLUMNS)
	var bottom := bottom_left.lerp(bottom_right, (float(column) + 0.5) / COLUMNS)
	return top.lerp(bottom, 0.5)

static func cell_polygon(index: int, inset: float = 6.0) -> PackedVector2Array:
	if index < 0 or index >= CELL_COUNT:
		return PackedVector2Array()
	var row := index / COLUMNS
	var column := index % COLUMNS
	var top_left := _edge_at(float(row) / ROWS, true)
	var top_right := _edge_at(float(row) / ROWS, false)
	var bottom_left := _edge_at(float(row + 1) / ROWS, true)
	var bottom_right := _edge_at(float(row + 1) / ROWS, false)
	var top_a := top_left.lerp(top_right, float(column) / COLUMNS)
	var top_b := top_left.lerp(top_right, float(column + 1) / COLUMNS)
	var bottom_a := bottom_left.lerp(bottom_right, float(column) / COLUMNS)
	var bottom_b := bottom_left.lerp(bottom_right, float(column + 1) / COLUMNS)
	var center := cell_center(index)
	return PackedVector2Array([
		center + (top_a - center) * 0.88 + Vector2(inset, inset),
		center + (top_b - center) * 0.88 + Vector2(-inset, inset),
		center + (bottom_b - center) * 0.88 + Vector2(-inset, -inset),
		center + (bottom_a - center) * 0.88 + Vector2(inset, -inset),
	])

static func board_rect() -> Rect2:
	return Rect2(Vector2(132.0, 176.0), Vector2(816.0, 652.0))

static func texture_position() -> Vector2:
	return TEXTURE_CENTER

static func texture_scale(texture_size: Vector2 = Vector2(1024.0, 1300.0)) -> Vector2:
	return Vector2(TEXTURE_SIZE.x / texture_size.x, TEXTURE_SIZE.y / texture_size.y)

static func camera_anchor() -> Vector2:
	return Vector2(540.0, 500.0)

static func ui_bottom() -> float:
	return board_rect().end.y
