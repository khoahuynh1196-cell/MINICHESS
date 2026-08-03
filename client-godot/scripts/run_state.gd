extends RefCounted

var run_id := ""
var state := ""
var round := 0
var revision := 0
var gold := 0
var health := 0
var level := 0
var experience := 0
var experience_to_next := 0
var board_cap := 0
var shop: Array = []
var bench: Array = []
var board: Array = []
var items: Array = []
var free_refreshes := 0
var round_reward_plan: Dictionary = {}
var reward_heroes: Array = []

func apply_server_view(view: Dictionary) -> void:
	apply_public_view(view)

func apply_public_view(view: Dictionary) -> void:
	run_id = String(view.get("id", ""))
	state = String(view.get("state", ""))
	round = int(view.get("round", 0))
	revision = int(view.get("revision", 0))
	gold = int(view.get("gold", 0))
	health = int(view.get("health", 0))
	level = int(view.get("level", 0))
	experience = int(view.get("experience", 0))
	experience_to_next = int(view.get("experienceToNext", 0))
	board_cap = int(view.get("boardCap", 0))
	shop = Array(view.get("shop", [])).duplicate(true)
	bench = Array(view.get("bench", [])).duplicate(true)
	board = Array(view.get("board", [])).duplicate(true)
	items = Array(view.get("items", [])).duplicate(true)
	free_refreshes = int(view.get("freeRefreshes", 0))
	round_reward_plan = Dictionary(view.get("roundRewardPlan", {})).duplicate(true)
	reward_heroes = Array(view.get("rewardHeroes", [])).duplicate(true)

func can_start_round() -> bool:
	return state == "PREPARE" and board.any(func(slot): return slot != null)

func can_buy_xp() -> bool:
	return state == "PREPARE" and gold >= 4 and experience_to_next > 0

func command_payload(command_id: String, command_type: String, fields: Dictionary = {}) -> Dictionary:
	var payload := {
		"command_id": command_id,
		"expected_run_revision": revision,
		"type": command_type,
	}
	for key in fields:
		payload[key] = fields[key]
	return payload
