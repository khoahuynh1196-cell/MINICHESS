extends SceneTree

const RunStateScript = preload("res://scripts/run_state.gd")
var _failed := false

func _init() -> void:
	var state = RunStateScript.new()
	state.apply_server_view({
		"id": "run-alpha",
		"state": "PREPARE",
		"round": 3,
		"revision": 7,
		"gold": 11,
		"health": 26,
		"shop": [{ "heroId": "H01", "cost": 1 }, null, { "heroId": "H04", "cost": 3 }, null],
		"bench": [{ "instanceId": "hero-bench-1", "heroId": "H01", "cost": 1, "stars": 1 }],
		"board": [{ "instanceId": "hero-board-1", "heroId": "H03", "cost": 1, "stars": 1 }, null, null, null, null, null, null, null, null, null, null, null],
		"roundRewardPlan": { "round": 3, "offers": [{ "id": "reward:3:hero_choice:0", "kind": "hero_choice", "options": [{ "id": "H02", "kind": "hero", "cost": 2 }] }] },
	})
	_expect(state.run_id == "run-alpha" and state.round == 3 and state.gold == 11 and state.health == 26, "server view must be retained as authoritative client state")
	_expect(state.can_start_round(), "a PREPARE run with a board hero must allow START_ROUND")
	_expect(state.command_payload("cmd-start", "START_ROUND") == { "command_id": "cmd-start", "expected_run_revision": 7, "type": "START_ROUND" }, "command payload must carry the authoritative revision")
	_expect(state.round_reward_plan.get("round", 0) == 3 and state.round_reward_plan.get("offers", []).size() == 1, "round reward plan must retain the server object and its selectable offers")

	state.apply_server_view({ "id": "run-alpha", "state": "COMBAT", "round": 3, "revision": 8, "gold": 11, "health": 26, "shop": [], "bench": [], "board": [] })
	_expect(not state.can_start_round(), "COMBAT state must disable prepare commands")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS run_state_test")
	quit(0)
