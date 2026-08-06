class_name BoardLayout
extends RefCounted

var _valid := false
var _columns := 0
var _rows := 0
var _enemy_start := 0
var _enemy_end := -1
var _player_start := 0
var _player_end := -1

func _init(rules: Dictionary) -> void:
	var board_value = rules.get("board", null)
	if typeof(board_value) != TYPE_DICTIONARY:
		push_error("BoardLayout requires rules.board")
		return
	var board: Dictionary = board_value
	_columns = int(board.get("columns", 0))
	_rows = int(board.get("rows", 0))
	var enemy_value = board.get("enemy_rows", null)
	var player_value = board.get("player_rows", null)
	if typeof(enemy_value) != TYPE_DICTIONARY or typeof(player_value) != TYPE_DICTIONARY:
		push_error("BoardLayout requires enemy_rows and player_rows")
		return
	var enemy: Dictionary = enemy_value
	var player: Dictionary = player_value
	_enemy_start = int(enemy.get("start", -1))
	_enemy_end = int(enemy.get("end", -1))
	_player_start = int(player.get("start", -1))
	_player_end = int(player.get("end", -1))
	if _columns <= 0 or _rows <= 0 or _enemy_start != 0 or _player_end != _rows - 1 or _enemy_end + 1 != _player_start:
		push_error("BoardLayout received an invalid board contract")
		return
	_valid = true

func is_valid() -> bool:
	return _valid

func columns() -> int:
	return _columns

func rows() -> int:
	return _rows

func global_cell_count() -> int:
	return _columns * _rows if _valid else 0

func player_cell_count() -> int:
	return (_player_end - _player_start + 1) * _columns if _valid else 0

func enemy_cell_count() -> int:
	return (_enemy_end - _enemy_start + 1) * _columns if _valid else 0

func is_global_position(position: int) -> bool:
	return _valid and position >= 0 and position < global_cell_count()

func row_for(position: int) -> int:
	return position / _columns if is_global_position(position) else -1

func column_for(position: int) -> int:
	return position % _columns if is_global_position(position) else -1

func global_index(row: int, column: int) -> int:
	if not _valid or row < 0 or row >= _rows or column < 0 or column >= _columns:
		return -1
	return row * _columns + column

func is_enemy_position(position: int) -> bool:
	var row := row_for(position)
	return row >= _enemy_start and row <= _enemy_end

func is_player_position(position: int) -> bool:
	var row := row_for(position)
	return row >= _player_start and row <= _player_end

func local_player_to_global(local_index: int) -> int:
	if local_index < 0 or local_index >= player_cell_count():
		return -1
	return _player_start * _columns + local_index

func global_player_to_local(global_position: int) -> int:
	if not is_player_position(global_position):
		return -1
	return global_position - _player_start * _columns

func manhattan_distance(left: int, right: int) -> int:
	if not is_global_position(left) or not is_global_position(right):
		return -1
	return absi(row_for(left) - row_for(right)) + absi(column_for(left) - column_for(right))

func orthogonal_neighbors(position: int) -> Array[int]:
	var neighbors: Array[int] = []
	if not is_global_position(position):
		return neighbors
	var row := row_for(position)
	var column := column_for(position)
	if column > 0:
		neighbors.append(position - 1)
	if column + 1 < _columns:
		neighbors.append(position + 1)
	if row > 0:
		neighbors.append(position - _columns)
	if row + 1 < _rows:
		neighbors.append(position + _columns)
	neighbors.sort()
	return neighbors
