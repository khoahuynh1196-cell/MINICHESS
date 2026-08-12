extends RefCounted

const SCHEMA_VERSION := 2
const CANONICAL_RULESET_VERSION := "production-4x6-0.1.0"
const CANONICAL_CONTENT_VERSION := "alpha-0.4.0"
const SAVE_PATH := "user://local_pve_run.json"
const PUBLIC_FIELDS := [
	"id", "contentVersion", "state", "round", "revision", "gold", "health", "level",
	"experience", "experienceToNext", "boardCap", "shop", "bench", "board", "items",
	"freeRefreshes", "shopOdds", "shopLocked", "roundRewardPlan", "rewardHeroes",
]
const RESUMABLE_STATES := ["PREPARE", "COMBAT", "REWARD"]
const ROSTER_IDS := [
	"H01", "H02", "H03", "H04", "H05", "H06", "H07", "H08", "H09", "H10",
	"H11", "H12", "H13", "H14", "H15", "H16", "H17", "H18", "H19", "H20",
]

func save_run(view: Dictionary) -> void:
	var public_view := _public_view(view)
	if not _is_valid_public_view(public_view):
		return
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file == null:
		return
	file.store_string(JSON.stringify({ "schema_version": SCHEMA_VERSION, "ruleset_version": CANONICAL_RULESET_VERSION, "view": public_view }))
	file.close()

func load_run() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return {}
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return {}
	var json := JSON.new()
	if json.parse(file.get_as_text()) != OK:
		file.close()
		return {}
	file.close()
	var parsed = json.data
	if typeof(parsed) != TYPE_DICTIONARY:
		return {}
	var envelope: Dictionary = parsed
	var schema_version = envelope.get("schema_version", null)
	if typeof(schema_version) != TYPE_INT and typeof(schema_version) != TYPE_FLOAT:
		return {}
	if schema_version != SCHEMA_VERSION:
		return {}
	if String(envelope.get("ruleset_version", "")) != CANONICAL_RULESET_VERSION:
		return {}
	var stored_view = envelope.get("view", {})
	if typeof(stored_view) != TYPE_DICTIONARY:
		return {}
	var public_view := _public_view(_normalize_json_numbers(stored_view))
	if not public_view.has("board"):
		return {}
	if public_view.get("board", []).size() > 12:
		return {}
	return public_view if _is_valid_public_view(public_view) else {}

func clear_run() -> void:
	if FileAccess.file_exists(SAVE_PATH):
		DirAccess.remove_absolute(ProjectSettings.globalize_path(SAVE_PATH))

func _public_view(view: Dictionary) -> Dictionary:
	var public_view := {}
	for field in PUBLIC_FIELDS:
		if view.has(field):
			public_view[field] = view[field]
	return public_view.duplicate(true)

func _is_valid_public_view(view: Dictionary) -> bool:
	if String(view.get("id", "")).is_empty() or String(view.get("contentVersion", "")) != CANONICAL_CONTENT_VERSION or not RESUMABLE_STATES.has(String(view.get("state", ""))):
		return false
	return _uses_current_roster(view)

func _uses_current_roster(value) -> bool:
	if value is Dictionary:
		var entry: Dictionary = value
		if entry.has("heroId") and not ROSTER_IDS.has(String(entry["heroId"])):
			return false
		if String(entry.get("kind", "")) == "hero" and not ROSTER_IDS.has(String(entry.get("id", ""))):
			return false
		for nested_value in entry.values():
			if not _uses_current_roster(nested_value):
				return false
	elif value is Array:
		for nested_value in value:
			if not _uses_current_roster(nested_value):
				return false
	return true

func _normalize_json_numbers(value):
	if value is Dictionary:
		var normalized := {}
		for key in value:
			normalized[key] = _normalize_json_numbers(value[key])
		return normalized
	if value is Array:
		var normalized: Array = []
		for entry in value:
			normalized.append(_normalize_json_numbers(entry))
		return normalized
	if value is float and value == floor(value):
		return int(value)
	return value
