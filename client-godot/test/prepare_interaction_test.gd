extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")
const FormationSlotButtonScript = preload("res://scripts/ui/formation_slot_button.gd")

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	var commands: Array = []
	controller.command_requested.connect(func(payload: Dictionary) -> void: commands.append(payload))
	controller._create_mobile_ui()
	controller.apply_run_view({
		"id": "run-prepare-ui", "state": "PREPARE", "round": 1, "revision": 4,
		"gold": 8, "health": 30, "level": 3, "experience": 0, "experienceToNext": 6, "boardCap": 3,
		"shop": [], "bench": [{ "instanceId": "bench-a", "heroId": "H01", "stars": 1 }],
		"board": _board(), "items": [{ "instanceId": "item-a", "itemId": "I01", "kind": "normal" }],
	})
	_expect(controller.prepare_screen != null, "a PREPARE run must render the routed Prepare shell")
	var bench_slot = controller.prepare_screen.find_child("BenchSlot00", true, false)
	var board_cell = controller.prepare_screen.find_child("BoardCell00", true, false)
	var has_drag_controls := bench_slot is FormationSlotButtonScript and board_cell is FormationSlotButtonScript
	_expect(has_drag_controls, "formation slots must provide actual drag/drop controls")
	if has_drag_controls:
		board_cell._drop_data(Vector2.ZERO, { "hero_instance_id": "bench-a", "origin": 0 })
		var drag_command: Dictionary = commands[0] if commands.size() > 0 else {}
		_expect(String(drag_command.get("type", "")) == "MOVE_HERO" and int(drag_command.get("destination", -1)) == 12, "dragging a bench hero onto board cell must bridge to MOVE_HERO")
	commands.clear()
	bench_slot = controller.prepare_screen.find_child("BenchSlot00", true, false)
	board_cell = controller.prepare_screen.find_child("BoardCell00", true, false)
	bench_slot.pressed.emit()
	board_cell = controller.prepare_screen.find_child("BoardCell00", true, false)
	board_cell.pressed.emit()
	var move_command: Dictionary = commands[0] if commands.size() > 0 else {}
	_expect(String(move_command.get("type", "")) == "MOVE_HERO", "tap formation flow must emit a MOVE_HERO command")
	_expect(int(move_command.get("destination", -1)) == 12, "formation command must preserve the selected destination")
	controller.prepare_screen.find_child("InventoryItem0", true, false).pressed.emit()
	controller.prepare_screen.find_child("BenchSlot00", true, false).pressed.emit()
	var equip_command: Dictionary = commands[1] if commands.size() > 1 else {}
	_expect(String(equip_command.get("type", "")) == "EQUIP_ITEM", "selected item flow must emit an EQUIP_ITEM command")
	controller.prepare_screen.find_child("ViewCollection", true, false).pressed.emit()
	_expect(controller.screen_router.current_screen_id == "collection", "collection remains reachable after Prepare interaction")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS prepare_interaction_test")
	quit(0)

func _board() -> Array:
	var board: Array = []
	board.resize(12)
	board.fill(null)
	return board

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
