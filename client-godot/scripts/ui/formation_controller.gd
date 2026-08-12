class_name FormationController
extends RefCounted

signal move_requested(hero_instance_id: String, destination: int)

var selected_hero_instance_id := ""

func select_hero(hero_instance_id: String, run_state: String) -> bool:
	if run_state != "PREPARE" or hero_instance_id.is_empty():
		return false
	selected_hero_instance_id = hero_instance_id
	return true

func clear_selection() -> void:
	selected_hero_instance_id = ""

func has_selection() -> bool:
	return not selected_hero_instance_id.is_empty()

func request_selected_move(destination: int, run_state: String) -> bool:
	var requested := request_return_to_bench(selected_hero_instance_id, destination, run_state) if _is_bench_destination(destination) else request_move(selected_hero_instance_id, destination, run_state)
	if not requested:
		return false
	clear_selection()
	return true

func request_drag_drop(hero_instance_id: String, destination: int, run_state: String) -> bool:
	# Drag/drop and the keyboard/tap fallback share the same authoritative intent.
	return request_return_to_bench(hero_instance_id, destination, run_state) if _is_bench_destination(destination) else request_move(hero_instance_id, destination, run_state)

func request_move(hero_instance_id: String, destination: int, run_state: String) -> bool:
	if run_state != "PREPARE" or hero_instance_id.is_empty() or not _is_formation_destination(destination):
		return false
	move_requested.emit(hero_instance_id, destination)
	return true

func request_return_to_bench(hero_instance_id: String, bench_slot: int, run_state: String) -> bool:
	if run_state != "PREPARE" or hero_instance_id.is_empty() or not _is_bench_destination(bench_slot):
		return false
	move_requested.emit(hero_instance_id, bench_slot)
	return true

func _is_formation_destination(destination: int) -> bool:
	return destination >= 12 and destination <= 23

func _is_bench_destination(destination: int) -> bool:
	return destination >= 0 and destination < 8
