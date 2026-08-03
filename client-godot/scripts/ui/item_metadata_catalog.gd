class_name ItemMetadataCatalog
extends RefCounted

const METADATA_PATH := "res://assets/content/item_metadata.json"
static var _metadata: Dictionary = {}

static func item_metadata(item_id: String) -> Dictionary:
	if _metadata.is_empty():
		_metadata = _load_metadata()
	return Dictionary(_metadata.get(item_id, {})).duplicate(true)

static func _load_metadata() -> Dictionary:
	var file := FileAccess.open(METADATA_PATH, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	return Dictionary(parsed.get("items", {}))
