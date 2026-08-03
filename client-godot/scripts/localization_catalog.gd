class_name LocalizationCatalog
extends RefCounted

const SUPPORTED_LOCALES := ["en", "vi"]
const PATH_TEMPLATE := "res://assets/localization/%s.json"

var locale := "en"
var _messages: Dictionary = {}
var missing_keys: PackedStringArray = []

func _init(initial_locale: String = "en") -> void:
	set_locale(initial_locale)

func set_locale(next_locale: String) -> void:
	locale = next_locale if next_locale in SUPPORTED_LOCALES else "en"
	_messages = _load_messages(locale)

func text(key: String, variables: Dictionary = {}) -> String:
	var template := String(_messages.get(key, ""))
	if template.is_empty() and locale != "en":
		template = String(_load_messages("en").get(key, ""))
	if template.is_empty():
		if not missing_keys.has(key):
			missing_keys.append(key)
			push_warning("Missing localisation key: %s" % key)
		return key
	for variable_name in variables:
		template = template.replace("{%s}" % String(variable_name), str(variables[variable_name]))
	return template

func _load_messages(requested_locale: String) -> Dictionary:
	var file := FileAccess.open(PATH_TEMPLATE % requested_locale, FileAccess.READ)
	if file == null:
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	return Dictionary(parsed) if typeof(parsed) == TYPE_DICTIONARY else {}
