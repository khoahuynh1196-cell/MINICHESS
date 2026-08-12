extends SceneTree

const METADATA_PATH := "res://../tmp/adventure-combat-frame-1080x1920.json"

func _init() -> void:
	var path := ProjectSettings.globalize_path(METADATA_PATH)
	if not FileAccess.file_exists(path):
		push_error("capture metadata sidecar is missing: %s" % path)
		quit(1)
		return
	var parsed := JSON.parse_string(FileAccess.get_file_as_string(path))
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("capture metadata must be a JSON object")
		quit(1)
		return
	_expect(parsed.get("ruleset_version") == "production-4x6-0.1.0", "capture must declare the canonical 4x6 ruleset")
	_expect(parsed.get("content_version") == "alpha-0.4.0", "capture must declare canonical content")
	_expect(parsed.get("asset_manifest_version") == "asset-4x6-0.1.0", "capture must declare canonical assets")
	_expect(parsed.get("viewport") == { "width": 1080, "height": 1920 }, "capture must use the portrait viewport")
	_expect(float(parsed.get("footer_safe_y", -1.0)) <= 828.0, "capture footer must remain below the board")
	print("PASS capture_adventure_frame_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	push_error(message)
	quit(1)
