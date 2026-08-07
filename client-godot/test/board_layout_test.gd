extends SceneTree

const RulesetCatalogScript = preload("res://scripts/rules/ruleset_catalog.gd")
const BoardLayoutScript = preload("res://scripts/rules/board_layout.gd")

var _failed := false

func _init() -> void:
	var rules := RulesetCatalogScript.load_ruleset()
	var layout = BoardLayoutScript.new(rules)
	_expect(layout.is_valid(), "board layout must accept the canonical ruleset")
	_expect(layout.columns() == 4 and layout.rows() == 8, "board dimensions must be 4x8")
	_expect(layout.global_cell_count() == 32, "global board must contain 32 cells")
	_expect(layout.enemy_cell_count() == 16 and layout.player_cell_count() == 16, "each side must own 16 cells")
	_expect(layout.local_player_to_global(0) == 16 and layout.local_player_to_global(15) == 31, "local player cells must map to global cells 16 through 31")
	_expect(layout.global_player_to_local(16) == 0 and layout.global_player_to_local(31) == 15, "global player cells must map back to local indices")
	_expect(layout.global_index(4, 0) == 16 and layout.global_index(7, 3) == 31, "row-column conversion must use four columns")
	_expect(layout.row_for(22) == 5 and layout.column_for(22) == 2, "position 22 must resolve to row 5 column 2")
	_expect(layout.orthogonal_neighbors(0) == [1, 4], "top-left neighbors must be stable")
	_expect(layout.orthogonal_neighbors(5) == [1, 4, 6, 9], "interior neighbors must be stable")
	_expect(layout.orthogonal_neighbors(31) == [27, 30], "bottom-right neighbors must be stable")
	_expect(layout.manhattan_distance(0, 31) == 10, "Manhattan distance must use the canonical board")
	_expect(layout.local_player_to_global(16) == -1 and layout.global_player_to_local(15) == -1, "invalid side mappings must fail closed")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS board_layout_test")
	quit(0)
