class_name ReplayLoader
extends RefCounted

const CombatEventScript = preload("res://scripts/combat_event.gd")

static func load_events(path: String) -> Array:
	if not FileAccess.file_exists(path):
		push_error("Replay fixture not found: %s" % path)
		return []

	var parser := JSON.new()
	if parser.parse(FileAccess.get_file_as_string(path)) != OK:
		push_error("Replay fixture is not valid JSON: %s" % path)
		return []
	if typeof(parser.data) != TYPE_DICTIONARY or typeof(parser.data.get("events")) != TYPE_ARRAY:
		push_error("Replay fixture requires an events array")
		return []

	var events: Array = []
	var previous_sequence := -1
	for raw_event in parser.data.events:
		if typeof(raw_event) != TYPE_DICTIONARY \
			or not _is_json_integer(raw_event.get("sequence")) \
			or not _is_json_integer(raw_event.get("tick")) \
			or typeof(raw_event.get("type")) != TYPE_STRING \
			or String(raw_event.get("type")).is_empty():
			push_error("Replay fixture contains an invalid or unordered event")
			return []
		var sequence := int(raw_event.get("sequence"))
		if sequence <= previous_sequence:
			push_error("Replay fixture contains an invalid or unordered event")
			return []
		previous_sequence = sequence
		raw_event["sequence"] = sequence
		raw_event["tick"] = int(raw_event.get("tick"))
		events.append(CombatEventScript.from_dictionary(raw_event))
	return events

static func _is_json_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_FLOAT and is_equal_approx(value, floor(value))
