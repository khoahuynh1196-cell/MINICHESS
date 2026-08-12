extends SceneTree

const OnlineSessionScript = preload("res://scripts/online_session.gd")
var _failed := false

func _init() -> void:
	var session = OnlineSessionScript.new()
	var states: Array = []
	session.state_changed.connect(func(state: Dictionary) -> void: states.append(state))
	session.apply_identity({ "player_id": "guest-a", "access_token": "access", "refresh_token": "refresh" })
	_expect(session.player_id == "guest-a" and session.refresh_token == "refresh", "guest identity must be retained for online reconnect")
	session.apply_matchmaking({ "ticket_id": "ticket-a" })
	_expect(session.match_ticket_id == "ticket-a" and states.back().get("state", "") == "QUEUED", "matchmaking must expose a queued state before eight seats fill")
	session.apply_matchmaking({ "room": { "room_id": "room-a", "lease": { "fencing_token": 1 }, "players": ["guest-a"] } })
	_expect(session.room_id == "room-a" and states.back().get("state", "") == "MATCHED", "matchmaking must transition to a matched room")
	session.apply_room_snapshot({ "room_id": "room-a", "room": { "room_id": "room-a", "lease": { "fencing_token": 2 } }, "realtime": { "lastSequence": 4 } })
	_expect(states.back().get("state", "") == "RECONNECTED" and session.next_sequence() == 5, "reconnect must resume ordered realtime sequence after the snapshot")
	if _failed:
		quit(1)
		return
	print("PASS online_session_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
