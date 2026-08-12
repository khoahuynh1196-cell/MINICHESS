class_name OnlineSession
extends RefCounted

signal state_changed(state: Dictionary)
signal error_received(message: String)

var api_client
var player_id := ""
var refresh_token := ""
var match_ticket_id := ""
var room_id := ""
var room: Dictionary = {}
var _fencing_token := 0
var _sequence := 0

func _init(next_api_client = null) -> void:
	api_client = next_api_client
	if api_client != null:
		api_client.identity_received.connect(apply_identity)
		api_client.matchmaking_received.connect(apply_matchmaking)
		api_client.room_received.connect(_apply_room_response)

func begin_guest(device_id: String) -> void:
	if api_client == null:
		error_received.emit("Online API is not ready")
		return
	api_client.begin_guest_auth(device_id)

func queue(region: String, mode: String) -> void:
	if api_client == null or player_id.is_empty():
		error_received.emit("Sign in before matchmaking")
		return
	api_client.queue_matchmaking(region, mode)

func poll_match() -> void:
	if api_client == null or match_ticket_id.is_empty():
		error_received.emit("Match ticket is not connected")
		return
	api_client.poll_matchmaking_ticket(match_ticket_id)

func apply_identity(identity: Dictionary) -> void:
	player_id = String(identity.get("player_id", ""))
	refresh_token = String(identity.get("refresh_token", ""))
	if api_client != null:
		api_client.set_access_token(String(identity.get("access_token", "")))
	state_changed.emit({ "state": "AUTHENTICATED", "player_id": player_id })

func apply_matchmaking(result: Dictionary) -> void:
	var matched_room: Dictionary = Dictionary(result.get("room", {}))
	if matched_room.is_empty():
		match_ticket_id = String(result.get("ticket_id", match_ticket_id))
		state_changed.emit({ "state": "QUEUED", "ticket_id": match_ticket_id })
		return
	match_ticket_id = String(result.get("ticket_id", match_ticket_id))
	room = matched_room.duplicate(true)
	room_id = String(room.get("room_id", ""))
	_fencing_token = int(Dictionary(room.get("lease", {})).get("fencing_token", 0))
	state_changed.emit({ "state": "MATCHED", "room_id": room_id, "room": room })

func apply_room_snapshot(snapshot: Dictionary) -> void:
	room = Dictionary(snapshot.get("room", {})).duplicate(true)
	room_id = String(snapshot.get("room_id", room_id))
	var realtime := Dictionary(snapshot.get("realtime", {}))
	_sequence = int(realtime.get("lastSequence", _sequence))
	_fencing_token = int(Dictionary(room.get("lease", {})).get("fencing_token", _fencing_token))
	state_changed.emit({ "state": "RECONNECTED", "room_id": room_id, "room": room, "realtime": realtime })

func ready() -> void:
	if api_client == null or room_id.is_empty():
		error_received.emit("Room is not connected")
		return
	api_client.send_room_ready(room_id, _fencing_token, "ready:%s:%d" % [player_id, _sequence])

func reconnect() -> void:
	if api_client == null or room_id.is_empty():
		error_received.emit("Room is not connected")
		return
	api_client.fetch_realtime_snapshot(room_id)

func _apply_room_response(response: Dictionary) -> void:
	if response.has("realtime"):
		apply_room_snapshot(response)
		return
	if response.has("accepted"):
		state_changed.emit({ "state": "READY", "room_id": room_id, "result": response })
		return
	apply_matchmaking({ "room": response })

func next_sequence() -> int:
	_sequence += 1
	return _sequence
