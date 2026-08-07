class_name AdventureViewModel
extends RefCounted

var run_id := ""
var revision := -1
var phase := ""
var ruleset_version := ""
var content_version := ""
var round_number := 0
var gold := 0
var health := 0
var level := 0
var experience := 0
var experience_to_next := 0
var board_cap := 0
var shop_odds: Array = []
var shop: Array = []
var board: Array = []
var bench: Array = []
var items: Array = []
var reward_heroes: Array = []
var traits: Array = []
var actions: Dictionary = {}
var pending_reward: Dictionary = {}
var last_combat: Dictionary = {}
var shop_locked := false
var free_refreshes := 0

func apply_view(view: Dictionary, rules: Dictionary) -> bool:
	if not _valid_view(view, rules):
		return false
	run_id = String(view["id"])
	revision = int(view["revision"])
	phase = String(view["phase"])
	ruleset_version = String(view["rulesetVersion"])
	content_version = String(view["contentVersion"])
	round_number = int(view["round"])
	gold = int(view["gold"])
	health = int(view["health"])
	level = int(view["level"])
	experience = int(view["experience"])
	experience_to_next = int(view["experienceToNext"])
	board_cap = int(view["boardCap"])
	shop_odds = Array(view["shopOdds"]).duplicate(true)
	shop = Array(view["shop"]).duplicate(true)
	board = Array(view["board"]).duplicate(true)
	bench = Array(view["bench"]).duplicate(true)
	items = Array(view["items"]).duplicate(true)
	reward_heroes = Array(view["rewardHeroes"]).duplicate(true)
	traits = Array(view["traits"]).duplicate(true)
	actions = Dictionary(view["actions"]).duplicate(true)
	pending_reward = Dictionary(view.get("pendingReward", {})).duplicate(true)
	last_combat = Dictionary(view.get("lastCombat", {})).duplicate(true)
	shop_locked = bool(view["shopLocked"])
	free_refreshes = int(view["freeRefreshes"])
	return true

func action_allowed(action_name: String) -> bool:
	var action_value = actions.get(action_name, {})
	return typeof(action_value) == TYPE_DICTIONARY and bool(Dictionary(action_value).get("allowed", false))

func action_reason(action_name: String) -> String:
	var action_value = actions.get(action_name, {})
	return String(Dictionary(action_value).get("reason", "")) if typeof(action_value) == TYPE_DICTIONARY else "ACTION_CONTRACT_MISSING"

func shop_slot_allowed(index: int) -> bool:
	var action := _shop_slot_action(index)
	return bool(action.get("allowed", false))

func shop_slot_reason(index: int) -> String:
	return String(_shop_slot_action(index).get("reason", ""))

func deployed_count() -> int:
	return board.filter(func(hero): return hero != null).size()

func has_pending_reward() -> bool:
	return not pending_reward.is_empty()

func has_pending_reward_heroes() -> bool:
	return not reward_heroes.is_empty()

func to_dictionary() -> Dictionary:
	return {
		"id": run_id,
		"revision": revision,
		"phase": phase,
		"rulesetVersion": ruleset_version,
		"contentVersion": content_version,
		"round": round_number,
		"gold": gold,
		"health": health,
		"level": level,
		"experience": experience,
		"experienceToNext": experience_to_next,
		"boardCap": board_cap,
		"shopOdds": shop_odds.duplicate(true),
		"shop": shop.duplicate(true),
		"shopLocked": shop_locked,
		"freeRefreshes": free_refreshes,
		"board": board.duplicate(true),
		"bench": bench.duplicate(true),
		"items": items.duplicate(true),
		"rewardHeroes": reward_heroes.duplicate(true),
		"traits": traits.duplicate(true),
		"actions": actions.duplicate(true),
		"pendingReward": pending_reward.duplicate(true),
		"lastCombat": last_combat.duplicate(true),
	}

func _shop_slot_action(index: int) -> Dictionary:
	var slots_value = actions.get("buyShopSlots", [])
	if typeof(slots_value) != TYPE_ARRAY:
		return { "allowed": false, "reason": "ACTION_CONTRACT_MISSING" }
	var slots: Array = slots_value
	if index < 0 or index >= slots.size() or typeof(slots[index]) != TYPE_DICTIONARY:
		return { "allowed": false, "reason": "INVALID_SHOP_SLOT" }
	return Dictionary(slots[index])

func _valid_view(view: Dictionary, rules: Dictionary) -> bool:
	var required_fields := [
		"id", "revision", "phase", "rulesetVersion", "contentVersion", "round", "gold", "health",
		"level", "experience", "experienceToNext", "boardCap", "shopOdds", "shop", "shopLocked",
		"freeRefreshes", "board", "bench", "items", "rewardHeroes", "traits", "actions",
	]
	for field in required_fields:
		if not view.has(field):
			return false
	if String(view["id"]).is_empty() or int(view["revision"]) < 0:
		return false
	if not ["PREPARE", "COMBAT", "PLAYBACK", "REWARD", "COMPLETE"].has(String(view["phase"])):
		return false
	if String(view["rulesetVersion"]) != String(rules.get("version", "")):
		return false
	if typeof(view["shop"]) != TYPE_ARRAY or typeof(view["board"]) != TYPE_ARRAY or typeof(view["bench"]) != TYPE_ARRAY:
		return false
	var roster_value = rules.get("roster", {})
	var shop_value = rules.get("shop", {})
	var board_value = rules.get("board", {})
	if typeof(roster_value) != TYPE_DICTIONARY or typeof(shop_value) != TYPE_DICTIONARY or typeof(board_value) != TYPE_DICTIONARY:
		return false
	var roster: Dictionary = roster_value
	var shop_rules: Dictionary = shop_value
	var board_rules: Dictionary = board_value
	var player_rows_value = board_rules.get("player_rows", {})
	if typeof(player_rows_value) != TYPE_DICTIONARY:
		return false
	var player_rows: Dictionary = player_rows_value
	var expected_board_cells := (int(player_rows.get("end", -1)) - int(player_rows.get("start", 0)) + 1) * int(board_rules.get("columns", 0))
	return Array(view["shop"]).size() == int(shop_rules.get("slot_count", -1)) \
		and Array(view["bench"]).size() == int(roster.get("bench_slots", -1)) \
		and Array(view["board"]).size() == expected_board_cells
