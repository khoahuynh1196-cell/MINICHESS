class_name ItemDragButton
extends Button

var item_instance_id := ""

func configure_item(next_item_instance_id: String) -> void:
	item_instance_id = next_item_instance_id

func _get_drag_data(_at_position: Vector2) -> Variant:
	if disabled or item_instance_id.is_empty():
		return null
	if is_inside_tree():
		var preview := Label.new()
		preview.text = text
		preview.add_theme_font_size_override("font_size", 18)
		preview.modulate = Color(1.0, 1.0, 1.0, 0.85)
		set_drag_preview(preview)
	return { "item_instance_id": item_instance_id }
