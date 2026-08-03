extends SceneTree

const RunApiClientScript = preload("res://scripts/run_api_client.gd")

var _failed := false

func _init() -> void:
	var api = RunApiClientScript.new("https://api.example.test/")
	var payload := { "command_id": "cmd-9", "expected_run_revision": 4, "type": "START_ROUND" }
	var spec: Dictionary = api.command_request("run-alpha", payload)
	_expect(spec.url == "https://api.example.test/v1/runs/run-alpha/commands", "command request must target the run command endpoint")
	_expect(spec.method == HTTPClient.METHOD_POST, "commands must use POST")
	_expect(spec.headers.has("Content-Type: application/json"), "commands must declare JSON content")
	var encoded: Dictionary = JSON.parse_string(spec.body)
	_expect(encoded.get("command_id") == "cmd-9" and int(encoded.get("expected_run_revision")) == 4 and encoded.get("type") == "START_ROUND", "commands must preserve command ID and authoritative revision")
	_expect(api.resume_request("run-alpha").url == "https://api.example.test/v1/runs/run-alpha/resume", "resume must target the server resume endpoint")
	_expect(api.resolve_combat_request("run-alpha").url == "https://api.example.test/v1/runs/run-alpha/resolve-combat", "combat resolution must target the authoritative server endpoint")
	_expect(api.has_method("events_request") and api.has_method("fetch_events"), "API client must expose combat event stream requests")
	_expect(api.events_request("run-alpha", 7).url == "https://api.example.test/v1/runs/run-alpha/events?after_sequence=7", "event requests must resume after the requested replay sequence")
	_expect(api.events_request("run-alpha").url == "https://api.example.test/v1/runs/run-alpha/events", "a full event request must start from the first replay event")
	var lifecycle_errors: Array[String] = []
	api.request_failed.connect(func(message: String) -> void: lifecycle_errors.append(message))
	api.submit_command("run-alpha", payload)
	_expect(lifecycle_errors == ["API client is not ready"], "a detached API client must reject commands before creating HTTPRequest")
	api.free()
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS run_api_client_test")
	quit(0)
