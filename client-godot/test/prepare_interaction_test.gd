extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")
const FormationSlotButtonScript = preload("res://scripts/ui/formation_slot_button.gd")

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	var commands: Array = []
	controller.command_requested.connect(func(payload: Dictionary) -> void: commands.append(payload))
	controller._create_mobile_ui()
	controller.apply_run_view(_run_view("PREPARE"))
	_expect(controller.prepare_screen != null, "a PREPARE run must render the routed Prepare shell")
	var board_source = controller.prepare_screen.find_child("BoardCell00", true, false)
	var board_destination = controller.prepare_screen.find_child("BoardCell01", true, false)
	var bench_empty = controller.prepare_screen.find_child("BenchSlot02", true, false)
	var bench_occupied = controller.prepare_screen.find_child("BenchSlot00", true, false)
	var has_drag_controls := board_source is FormationSlotButtonScript and board_destination is FormationSlotButtonScript and bench_empty is FormationSlotButtonScript and bench_occupied is FormationSlotButtonScript
	_expect(has_drag_controls, "formation slots must provide actual drag/drop controls")
	if has_drag_controls:
		var initial_board: Array = controller.run_state.board.duplicate(true)
		var initial_bench: Array = controller.run_state.bench.duplicate(true)
		board_destination._drop_data(Vector2.ZERO, { "hero_instance_id": "board-a", "origin": 12 })
		_expect(_move_command(commands, "board-a", 13), "dragging a board hero onto an occupied board slot must bridge a board-to-board MOVE_HERO command")
		_expect(controller.run_state.board == initial_board and controller.run_state.bench == initial_bench, "board-to-board drag must not mutate local run state before the authoritative response")
		commands.clear()
		bench_empty = controller.prepare_screen.find_child("BenchSlot02", true, false)
		bench_empty._drop_data(Vector2.ZERO, { "hero_instance_id": "board-a", "origin": 12 })
		_expect(_move_command(commands, "board-a", 2), "dragging a board hero onto an empty bench slot must bridge a board-to-bench MOVE_HERO command")
		_expect(controller.run_state.board == initial_board and controller.run_state.bench == initial_bench, "board-to-bench drag must not mutate local run state before the authoritative response")
		commands.clear()
		bench_occupied = controller.prepare_screen.find_child("BenchSlot00", true, false)
		bench_occupied._drop_data(Vector2.ZERO, { "hero_instance_id": "board-a", "origin": 12 })
		_expect(_move_command(commands, "board-a", 0), "dragging a board hero onto an occupied bench slot must bridge a MOVE_HERO command for server-authoritative resolution")
		_expect(controller.run_state.board == initial_board and controller.run_state.bench == initial_bench, "occupied-bench drag must not mutate local run state before the authoritative response")
	commands.clear()
	var bench_slot = controller.prepare_screen.find_child("BenchSlot00", true, false)
	var board_cell = controller.prepare_screen.find_child("BoardCell02", true, false)
	bench_slot.pressed.emit()
	board_cell.pressed.emit()
	var move_command: Dictionary = commands[0] if commands.size() > 0 else {}
	_expect(String(move_command.get("type", "")) == "MOVE_HERO", "tap formation flow must emit a MOVE_HERO command")
	_expect(int(move_command.get("destination", -1)) == 14, "formation command must preserve the selected destination")
	controller.prepare_screen.find_child("InventoryItem0", true, false).pressed.emit()
	controller.prepare_screen.find_child("BenchSlot00", true, false).pressed.emit()
	var equip_command: Dictionary = commands[1] if commands.size() > 1 else {}
	_expect(String(equip_command.get("type", "")) == "EQUIP_ITEM", "selected item flow must emit an EQUIP_ITEM command")
	controller.prepare_screen.find_child("ViewCollection", true, false).pressed.emit()
	_expect(controller.screen_router.current_screen_id == "collection", "collection remains reachable after Prepare interaction")
	commands.clear()
	var combat_view := _run_view("COMBAT")
	controller.apply_run_view(combat_view)
	controller.request_drag_formation_move("board-a", 13)
	_expect(commands.is_empty(), "the drag command bridge must reject formation moves during COMBAT")
	_expect(controller.run_state.board == combat_view.board and controller.run_state.bench == combat_view.bench, "a rejected COMBAT drag must not mutate local run state")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS prepare_interaction_test")
	quit(0)

func _run_view(state: String) -> Dictionary:
	return {
		"id": "run-prepare-ui", "state": state, "round": 1, "revision": 4,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shop": [], "bench": [{ "instanceId": "bench-a", "heroId": "H01", "stars": 1 }, { "instanceId": "bench-b", "heroId": "H02", "stars": 1 }],
		"board": _board(), "items": [{ "instanceId": "item-a", "itemId": "I01", "kind": "normal" }],
	}

func _board() -> Array:
	var board: Array = []
	board.resize(12)
	board.fill(null)
	board[0] = { "instanceId": "board-a", "heroId": "H03", "stars": 1 }
	board[1] = { "instanceId": "board-b", "heroId": "H04", "stars": 1 }
	return board

func _move_command(commands: Array, hero_instance_id: String, destination: int) -> bool:
	if commands.size() != 1:
		return false
	var command: Dictionary = commands[0]
	return String(command.get("type", "")) == "MOVE_HERO" and String(command.get("hero_instance_id", "")) == hero_instance_id and int(command.get("destination", -1)) == destination

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
