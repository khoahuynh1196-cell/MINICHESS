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
		"level": 4,
		"experience": 2,
		"experienceToNext": 10,
		"boardCap": 4,
		"shopOdds": { "tier1": 45, "tier2": 35, "tier3": 18, "tier4": 2, "tier5": 0 },
		"shopLocked": true,
		"shop": [{ "heroId": "H01", "cost": 1 }, null, { "heroId": "H04", "cost": 3 }, null],
		"bench": [{ "instanceId": "hero-bench-1", "heroId": "H01", "cost": 1, "stars": 1 }],
		"board": [{ "instanceId": "hero-board-1", "heroId": "H03", "cost": 1, "stars": 1 }, null, null, null, null, null, null, null, null, null, null, null],
		"roundRewardPlan": { "round": 3, "offers": [{ "id": "reward:3:hero_choice:0", "kind": "hero_choice", "options": [{ "id": "H02", "kind": "hero", "cost": 2 }] }] },
	})
	_expect(state.run_id == "run-alpha" and state.round == 3 and state.gold == 11 and state.health == 26, "server view must be retained as authoritative client state")
	_expect(state.level == 4 and state.experience == 2 and state.experience_to_next == 10 and state.board_cap == 4, "level progression fields must retain the authoritative server values")
	_expect(state.shop_odds == { "tier1": 45, "tier2": 35, "tier3": 18, "tier4": 2, "tier5": 0 } and state.shop_locked, "shop presentation fields must retain only authoritative odds and lock state")
	_expect(state.can_buy_xp(), "a PREPARE run with four gold and an unfinished level must allow BUY_XP")
	_expect(state.can_start_round(), "a PREPARE run with a board hero must allow START_ROUND")
	_expect(state.command_payload("cmd-start", "START_ROUND") == { "command_id": "cmd-start", "expected_run_revision": 7, "type": "START_ROUND" }, "command payload must carry the authoritative revision")
	_expect(state.round_reward_plan.get("round", 0) == 3 and state.round_reward_plan.get("offers", []).size() == 1, "round reward plan must retain the server object and its selectable offers")
	state.apply_public_view({ "id": "run-local-view", "state": "PREPARE", "round": 4, "revision": 8, "gold": 12, "health": 25, "shop": [], "bench": [], "board": [], "shopOdds": { "tier1": 30, "tier2": 35, "tier3": 25, "tier4": 9, "tier5": 1 } })
	_expect(state.run_id == "run-local-view" and state.round == 4 and state.revision == 8, "a previously accepted public view must restore client presentation state without resolving gameplay")
	_expect(state.shop_odds.get("tier1", 0) == 30 and not state.shop_locked, "a new authoritative public view must replace odds and default an absent lock state to false")

	state.apply_server_view({ "id": "run-alpha", "state": "COMBAT", "round": 3, "revision": 8, "gold": 11, "health": 26, "level": 10, "experience": 0, "experienceToNext": 0, "boardCap": 6, "shop": [], "bench": [], "board": [] })
	_expect(not state.can_start_round(), "COMBAT state must disable prepare commands")
	_expect(not state.can_buy_xp(), "COMBAT and level-cap states must disable BUY_XP")
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
