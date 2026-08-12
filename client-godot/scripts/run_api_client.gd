extends Node

signal run_view_received(view: Dictionary)
signal command_completed(result: Dictionary)
signal request_failed(message: String)
signal combat_events_received(events: Array)
signal identity_received(identity: Dictionary)
signal matchmaking_received(result: Dictionary)
signal room_received(room: Dictionary)

var base_url := "http://127.0.0.1:3000"
var access_token := ""

func _init(next_base_url: String = "") -> void:
	if not next_base_url.is_empty():
		base_url = next_base_url.trim_suffix("/")

func set_access_token(next_access_token: String) -> void:
	access_token = next_access_token

func guest_auth_request(device_id: String) -> Dictionary:
	return _json_request("/v1/auth/guest", HTTPClient.METHOD_POST, { "device_id": device_id })

func refresh_auth_request(refresh_token: String) -> Dictionary:
	return _json_request("/v1/auth/refresh", HTTPClient.METHOD_POST, { "refresh_token": refresh_token })

func matchmaking_request(region: String, mode: String) -> Dictionary:
	return _json_request("/v1/matchmaking/tickets", HTTPClient.METHOD_POST, { "region": region, "mode": mode })

func matchmaking_ticket_request(ticket_id: String) -> Dictionary:
	return _json_request("/v1/matchmaking/tickets/%s" % ticket_id.uri_encode(), HTTPClient.METHOD_GET)

func room_request(room_id: String) -> Dictionary:
	return _json_request("/v1/rooms/%s" % room_id.uri_encode(), HTTPClient.METHOD_GET)

func room_command_request(room_id: String, fencing_token: int, command_id: String, command_type: String = "READY") -> Dictionary:
	return _json_request("/v1/rooms/%s/commands" % room_id.uri_encode(), HTTPClient.METHOD_POST, { "fencing_token": fencing_token, "command_id": command_id, "type": command_type })

func realtime_request(room_id: String, envelope: Dictionary) -> Dictionary:
	return _json_request("/v1/rooms/%s/realtime" % room_id.uri_encode(), HTTPClient.METHOD_POST, envelope)

func realtime_snapshot_request(room_id: String) -> Dictionary:
	return _json_request("/v1/rooms/%s/realtime/snapshot" % room_id.uri_encode(), HTTPClient.METHOD_GET)

func begin_guest_auth(device_id: String) -> void:
	_request(guest_auth_request(device_id), "online_identity", "")

func queue_matchmaking(region: String, mode: String) -> void:
	_request(matchmaking_request(region, mode), "online_matchmaking", "")

func poll_matchmaking_ticket(ticket_id: String) -> void:
	_request(matchmaking_ticket_request(ticket_id), "online_matchmaking", ticket_id)

func fetch_online_room(room_id: String) -> void:
	_request(room_request(room_id), "online_room", room_id)

func send_room_ready(room_id: String, fencing_token: int, command_id: String) -> void:
	_request(room_command_request(room_id, fencing_token, command_id), "online_room_command", room_id)

func fetch_realtime_snapshot(room_id: String) -> void:
	_request(realtime_snapshot_request(room_id), "online_snapshot", room_id)

func create_run_request(run_id: String, content_version: String) -> Dictionary:
	return _json_request("/v1/runs", HTTPClient.METHOD_POST, { "id": run_id, "content_version": content_version })

func command_request(run_id: String, payload: Dictionary) -> Dictionary:
	return _json_request("/v1/runs/%s/commands" % run_id.uri_encode(), HTTPClient.METHOD_POST, payload)

func resume_request(run_id: String) -> Dictionary:
	return _json_request("/v1/runs/%s/resume" % run_id.uri_encode(), HTTPClient.METHOD_GET)

func resolve_combat_request(run_id: String) -> Dictionary:
	return _json_request("/v1/runs/%s/resolve-combat" % run_id.uri_encode(), HTTPClient.METHOD_POST)

func events_request(run_id: String, after_sequence: int = -1) -> Dictionary:
	var suffix := "" if after_sequence < 0 else "?after_sequence=%s" % after_sequence
	return _json_request("/v1/runs/%s/events%s" % [run_id.uri_encode(), suffix], HTTPClient.METHOD_GET)

func fetch_run_request(run_id: String) -> Dictionary:
	return _json_request("/v1/runs/%s" % run_id.uri_encode(), HTTPClient.METHOD_GET)

func create_run(run_id: String, content_version: String) -> void:
	_request(create_run_request(run_id, content_version), "create", run_id)

func resume_run(run_id: String) -> void:
	_request(resume_request(run_id), "resume", run_id)

func resolve_combat(run_id: String) -> void:
	_request(resolve_combat_request(run_id), "resolve", run_id)

func fetch_events(run_id: String, after_sequence: int = -1) -> void:
	_request(events_request(run_id, after_sequence), "events", run_id)

func fetch_run(run_id: String) -> void:
	_request(fetch_run_request(run_id), "fetch", run_id)

func submit_command(run_id: String, payload: Dictionary) -> void:
	_request(command_request(run_id, payload), "start_command" if String(payload.get("type", "")) == "START_ROUND" else "command", run_id)

func _json_request(path: String, method: HTTPClient.Method, body: Dictionary = {}) -> Dictionary:
	var headers := PackedStringArray(["Accept: application/json"])
	if method != HTTPClient.METHOD_GET:
		headers.append("Content-Type: application/json")
	if not access_token.is_empty():
		headers.append("Authorization: Bearer %s" % access_token)
	return {
		"url": "%s%s" % [base_url, path],
		"method": method,
		"headers": headers,
		"body": "" if method == HTTPClient.METHOD_GET else JSON.stringify(body),
	}

func _request(spec: Dictionary, action: String, run_id: String) -> void:
	if not is_inside_tree():
		request_failed.emit("API client is not ready")
		return
	var request := HTTPRequest.new()
	add_child(request)
	request.request_completed.connect(_handle_response.bind(request, action, run_id))
	var error := request.request(spec.url, spec.headers, spec.method, spec.body)
	if error != OK:
		request.queue_free()
		request_failed.emit("Unable to start server request (%d)" % error)

func _handle_response(result: int, response_code: int, _headers: PackedStringArray, body: PackedByteArray, request: HTTPRequest, action: String, run_id: String) -> void:
	request.queue_free()
	if result != HTTPRequest.RESULT_SUCCESS:
		request_failed.emit("Network request failed (%d)" % result)
		return
	var parsed = JSON.parse_string(body.get_string_from_utf8())
	if typeof(parsed) != TYPE_DICTIONARY:
		request_failed.emit("Server returned invalid JSON")
		return
	if response_code < 200 or response_code >= 300:
		var failure: Dictionary = parsed
		var error_payload: Dictionary = failure.get("error", {})
		request_failed.emit(String(error_payload.get("message", "Server request failed")))
		return
	var envelope: Dictionary = parsed
	var data: Dictionary = envelope.get("data", {})
	if action == "online_identity":
		access_token = String(data.get("access_token", access_token))
		identity_received.emit(data)
		return
	if action == "online_matchmaking":
		matchmaking_received.emit(data)
		return
	if action == "online_room" or action == "online_room_command":
		room_received.emit(data)
		return
	if action == "online_snapshot":
		room_received.emit(data)
		return
	if action == "start_command":
		command_completed.emit(data)
		resolve_combat(run_id)
		return
	if action == "command":
		command_completed.emit(data)
		fetch_run(run_id)
		return
	if action == "resolve":
		run_view_received.emit(data)
		fetch_events(run_id)
		return
	if action == "events":
		combat_events_received.emit(Array(data.get("events", [])))
		return
	if action == "resume":
		run_view_received.emit(Dictionary(data.get("run_view", {})))
		if int(data.get("latest_event_sequence", -1)) >= 0:
			fetch_events(run_id)
		return
	run_view_received.emit(data)
