class_name SettingsStore
extends RefCounted

const SAVE_PATH := "user://player_settings.json"
const DEFAULTS := {
	"sound": true,
	"music": true,
	"haptics": true,
	"reduced_motion": false,
	"text_scale": 1.0,
	"language": "en",
}

func load_settings() -> Dictionary:
	if not FileAccess.file_exists(SAVE_PATH):
		return DEFAULTS.duplicate(true)
	var file := FileAccess.open(SAVE_PATH, FileAccess.READ)
	if file == null:
		return DEFAULTS.duplicate(true)
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		return DEFAULTS.duplicate(true)
	var settings := DEFAULTS.duplicate(true)
	for key in DEFAULTS:
		if parsed.has(key) and typeof(parsed[key]) == typeof(DEFAULTS[key]):
			settings[key] = parsed[key]
	return settings

func save_settings(settings: Dictionary) -> void:
	var normalized := DEFAULTS.duplicate(true)
	for key in DEFAULTS:
		if settings.has(key) and typeof(settings[key]) == typeof(DEFAULTS[key]):
			normalized[key] = settings[key]
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	if file != null:
		file.store_string(JSON.stringify(normalized))
		file.close()
