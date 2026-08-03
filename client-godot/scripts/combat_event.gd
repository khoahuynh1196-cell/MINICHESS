extends RefCounted

var sequence: int
var tick: int
var type: String
var payload: Dictionary
var source_unit_id: String
var target_unit_id: String

static func from_dictionary(value: Dictionary):
	var event = load("res://scripts/combat_event.gd").new()
	event.sequence = int(value["sequence"])
	event.tick = int(value["tick"])
	event.type = String(value["type"])
	event.payload = Dictionary(value.get("payload", {}))
	event.source_unit_id = String(value.get("source_unit_id", ""))
	event.target_unit_id = String(value.get("target_unit_id", ""))
	return event
