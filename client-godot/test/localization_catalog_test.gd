extends SceneTree

const LocalizationCatalogScript = preload("res://scripts/localization_catalog.gd")

var _failed := false

func _init() -> void:
	var catalog = LocalizationCatalogScript.new("en")
	_expect(catalog.text("screen.prepare") == "Prepare Your Party", "English screen copy must resolve")
	catalog.set_locale("vi")
	_expect(catalog.text("screen.prepare") == "Chuan Bi Doi Hinh", "Vietnamese screen copy must resolve")
	_expect(catalog.text("settings.language", { "language": "Tieng Viet" }).contains("Tieng Viet"), "variables must interpolate into copy")
	_expect(catalog.text("missing.key") == "missing.key" and catalog.missing_keys.has("missing.key"), "missing keys must be diagnosable without a crash")
	if _failed:
		quit(1)
		return
	print("PASS localization_catalog_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
