extends SceneTree

const RuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")

var _failed := false

func _init() -> void:
	var port = RuntimePortScript.new()
	var submitted: Array = []
	var views: Array = []
	var errors: Array = []
	var playbacks: Array = []
	port.request_submitted.connect(func(request: Dictionary) -> void: submitted.append(request))
	port.view_changed.connect(func(view: Dictionary) -> void: views.append(view))
	port.combat_playback_ready.connect(func(playback: Dictionary) -> void: playbacks.append(playback))
	port.protocol_error.connect(func(message: String) -> void: errors.append(message))

	var request := {
		"commandId": "cmd-lock",
		"expectedRevision": 0,
		"type": "LOCK_SHOP",
	}
	_expect(port.submit(request), "a valid runtime request must be submitted")
	request["commandId"] = "mutated-after-submit"
	_expect(submitted == [{
		"commandId": "cmd-lock",
		"expectedRevision": 0,
		"type": "LOCK_SHOP",
	}], "submitted requests must be deep copies")

	var response := {
		"revision": 1,
		"replayed": false,
		"view": {
			"id": "run-port",
			"revision": 1,
			"phase": "PREPARE",
			"round": 1,
			"gold": 8,
			"health": 30,
			"board": [],
			"bench": [],
			"shop": [],
		},
	}
	_expect(port.accept_response(response), "a valid public runtime response must be accepted")
	response.view.gold = 999
	_expect(port.current_view().get("gold", 0) == 8, "accepted views must be deep copied")
	_expect(views.size() == 1 and int(views[0].get("revision", -1)) == 1, "accepted views must emit view_changed")
	_expect(playbacks.is_empty(), "a response without playback must not emit combat_playback_ready")

	var playback_response := {
		"revision": 2,
		"replayed": false,
		"view": { "revision": 2, "phase": "REWARD", "round": 1, "gold": 8, "health": 30, "board": [], "bench": [], "shop": [] },
		"playback": {
			"combatId": "combat:run-port:1:3",
			"events": [{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED" }],
		},
	}
	_expect(port.accept_response(playback_response), "a response with valid playback must be accepted")
	_expect(playbacks.size() == 1 and playbacks[0].get("combatId", "") == "combat:run-port:1:3",
		"a response with playback must emit combat_playback_ready")

	_expect(not port.accept_response({
		"revision": 3,
		"replayed": false,
		"view": { "revision": 3 },
		"playback": { "combatId": "", "events": [] },
	}), "a playback missing combatId must be rejected")
	_expect(playbacks.size() == 1, "a rejected playback must not emit combat_playback_ready")

	_expect(not port.accept_response({
		"revision": 0,
		"replayed": false,
		"view": { "revision": 0 },
	}), "a stale response must be rejected")
	_expect(not port.accept_response({
		"revision": 2,
		"replayed": false,
		"view": { "revision": 1 },
	}), "a mismatched response revision must be rejected")
	_expect(not port.accept_response({
		"revision": 2,
		"replayed": false,
		"view": { "revision": 2, "nested": { "shopPool": {} } },
	}), "private fields must be rejected even when nested")
	_expect(not port.submit({ "commandId": "", "expectedRevision": 1, "type": "LOCK_SHOP" }), "empty command IDs must be rejected")
	_expect(not port.submit({ "commandId": "x", "expectedRevision": -1, "type": "LOCK_SHOP" }), "negative revisions must be rejected")
	_expect(errors.size() >= 6, "protocol failures must emit errors")

	port.clear()
	_expect(not port.has_view() and port.current_view().is_empty(), "clear must remove the cached view")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS adventure_runtime_port_test")
	quit(0)
