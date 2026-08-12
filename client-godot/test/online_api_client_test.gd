extends SceneTree

const RunApiClientScript = preload("res://scripts/run_api_client.gd")
var _failed := false

func _init() -> void:
	var api = RunApiClientScript.new("https://api.example.test/")
	_expect(api.guest_auth_request("device-a").url == "https://api.example.test/v1/auth/guest", "guest auth must use the versioned auth endpoint")
	_expect(api.refresh_auth_request("refresh").body == JSON.stringify({ "refresh_token": "refresh" }), "refresh must carry the opaque refresh token")
	api.set_access_token("access")
	_expect(api.matchmaking_request("sea", "ranked").headers.has("Authorization: Bearer access"), "matchmaking must carry the access token")
	_expect(api.matchmaking_ticket_request("ticket-a").url == "https://api.example.test/v1/matchmaking/tickets/ticket-a", "queued matches must expose a polling endpoint")
	_expect(api.room_request("room-a").url == "https://api.example.test/v1/rooms/room-a", "room fetch must target the authoritative room endpoint")
	_expect(api.room_command_request("room-a", 3, "cmd-ready").body == JSON.stringify({ "fencing_token": 3, "command_id": "cmd-ready", "type": "READY" }), "room command must carry the fencing token and idempotency key")
	_expect(api.realtime_request("room-a", { "type": "PING", "sequence": 1, "sent_at": 10 }).url == "https://api.example.test/v1/rooms/room-a/realtime", "realtime envelopes must target the room endpoint")
	_expect(api.realtime_snapshot_request("room-a").url == "https://api.example.test/v1/rooms/room-a/realtime/snapshot", "reconnect must fetch a room-scoped realtime snapshot")
	api.free()
	if _failed:
		quit(1)
		return
	print("PASS online_api_client_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
