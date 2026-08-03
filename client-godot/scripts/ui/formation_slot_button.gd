class_name FormationSlotButton
extends Button

signal move_dropped(hero_instance_id: String, destination: int)
signal item_equip_dropped(item_instance_id: String, hero_instance_id: String)

var hero_instance_id := ""
var destination := -1
var _drop_highlighted := false

func configure_slot(next_hero_instance_id: String, next_destination: int, enabled_for_prepare: bool) -> void:
	hero_instance_id = next_hero_instance_id
	destination = next_destination
	disabled = not enabled_for_prepare
	_clear_drop_highlight()

func _get_drag_data(_at_position: Vector2) -> Variant:
	if disabled or hero_instance_id.is_empty():
		return null
	if is_inside_tree():
		var ghost := Label.new()
		ghost.text = text
		ghost.add_theme_font_size_override("font_size", 18)
		ghost.modulate = Color(1.0, 1.0, 1.0, 0.85)
		set_drag_preview(ghost)
	return { "hero_instance_id": hero_instance_id, "origin": destination }

func _can_drop_data(_at_position: Vector2, data: Variant) -> bool:
	var is_hero_move := data is Dictionary and String(data.get("hero_instance_id", "")) != "" and int(data.get("origin", -1)) != destination
	var is_item_equip := data is Dictionary and not hero_instance_id.is_empty() and String(data.get("item_instance_id", "")) != ""
	var valid := not disabled and (is_hero_move or is_item_equip)
	_set_drop_highlight(valid)
	return valid

func _drop_data(at_position: Vector2, data: Variant) -> void:
	if _can_drop_data(at_position, data):
		if String(data.get("item_instance_id", "")).is_empty():
			move_dropped.emit(String(data.get("hero_instance_id", "")), destination)
		else:
			item_equip_dropped.emit(String(data.get("item_instance_id", "")), hero_instance_id)
	_clear_drop_highlight()

func is_drop_highlighted() -> bool:
	return _drop_highlighted

func _notification(what: int) -> void:
	if what == NOTIFICATION_DRAG_END:
		_clear_drop_highlight()

func _set_drop_highlight(active: bool) -> void:
	_drop_highlighted = active
	self_modulate = Color(1.18, 1.12, 0.72, 1.0) if active else Color.WHITE

func _clear_drop_highlight() -> void:
	_set_drop_highlight(false)
