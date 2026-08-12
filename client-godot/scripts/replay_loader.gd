class_name ReplayLoader
extends RefCounted

const CombatEventScript = preload("res://scripts/combat_event.gd")
const CANONICAL_SCHEMA_VERSION := "production-4x6-0.1.0"
const LEGACY_SCHEMA_VERSION := "alpha-0.3.0"

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
	var schema_version := String(parser.data.get("schema_version", ""))
	if schema_version != CANONICAL_SCHEMA_VERSION and schema_version != LEGACY_SCHEMA_VERSION:
		push_error("Replay fixture has an unsupported schema version: %s" % schema_version)
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
		var payload = raw_event.get("payload", {})
		if typeof(payload) != TYPE_DICTIONARY:
			push_error("Replay fixture event payload must be an object")
			return []
		var normalized_payload = _normalize_position_fields(payload, schema_version)
		if normalized_payload == null:
			push_error("Replay fixture contains a position outside the selected board contract")
			return []
		raw_event["payload"] = normalized_payload
		events.append(CombatEventScript.from_dictionary(raw_event))
	return events

static func _normalize_position_fields(payload: Dictionary, schema_version: String) -> Variant:
	var normalized: Dictionary = payload.duplicate(true)
	for field in ["position", "from", "to"]:
		if not normalized.has(field):
			continue
		if not _is_json_integer(normalized[field]):
			return null
		var position := int(normalized[field])
		if schema_version == LEGACY_SCHEMA_VERSION:
			if position >= 0 and position <= 11:
				normalized[field] = position
			elif position >= 16 and position <= 27:
				normalized[field] = 12 + (position - 16)
			else:
				return null
		elif position < 0 or position > 23:
			return null
	return normalized

static func _is_json_integer(value: Variant) -> bool:
	return typeof(value) == TYPE_FLOAT and is_equal_approx(value, floor(value))
