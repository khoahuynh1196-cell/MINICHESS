extends SceneTree

const RulesetCatalogScript = preload("res://scripts/rules/ruleset_catalog.gd")
const ViewModelScript = preload("res://scripts/adventure/adventure_view_model.gd")

var _failed := false

func _init() -> void:
	var rules := RulesetCatalogScript.load_ruleset()
	var model = ViewModelScript.new()
	var view := _view()
	_expect(model.apply_view(view, rules), "valid Adventure view must apply")
	_expect(model.run_id == "view-model-run" and model.revision == 4 and model.phase == "PREPARE", "identity and phase fields must be typed")
	_expect(model.level == 3 and model.experience_to_next == 10 and model.board_cap == 3, "progression fields must be typed")
	_expect(model.shop.size() == 5 and model.board.size() == 16 and model.bench.size() == 8, "rules-sized collections must be retained")
	_expect(model.deployed_count() == 1, "deployed_count must count non-null board heroes")
	_expect(model.action_allowed("refreshShop"), "allowed actions must be readable")
	_expect(not model.action_allowed("buyXp") and model.action_reason("buyXp") == "NOT_ENOUGH_GOLD", "disabled actions must expose their reason")
	_expect(model.shop_slot_allowed(0) and not model.shop_slot_allowed(1), "shop slot action availability must be readable")
	_expect(model.shop_slot_reason(1) == "SLOT_EMPTY", "shop slot rejection reason must be readable")
	_expect(model.has_pending_reward() and not model.has_pending_reward_heroes(), "pending reward helpers must reflect view state")

	view["gold"] = 999
	view["board"][15]["heroId"] = "MUTATED"
	_expect(model.gold == 8 and String(model.board[15].get("heroId", "")) == "H01", "view model must deep copy nested data")
	var exported := model.to_dictionary()
	exported["bench"][0] = { "heroId": "MUTATED" }
	_expect(model.bench[0] == null, "to_dictionary must return deep copies")

	var invalid := _view()
	invalid["board"] = []
	_expect(not model.apply_view(invalid, rules), "wrong board size must be rejected")
	_expect(model.revision == 4 and model.gold == 8, "rejected views must not mutate the previous model")
	var wrong_rules := _view()
	wrong_rules["rulesetVersion"] = "old-rules"
	_expect(not model.apply_view(wrong_rules, rules), "ruleset mismatch must be rejected")
	_finish()

func _view() -> Dictionary:
	var board: Array = []
	board.resize(16)
	board.fill(null)
	board[15] = {
		"instanceId": "hero-a",
		"heroId": "H01",
		"cost": 1,
		"stars": 1,
		"poolCopies": 1,
		"acquisitionOrder": 1,
	}
	var bench: Array = []
	bench.resize(8)
	bench.fill(null)
	return {
		"id": "view-model-run",
		"revision": 4,
		"phase": "PREPARE",
		"rulesetVersion": "production-rules-0.1.0",
		"contentVersion": "alpha-0.3.0",
		"round": 1,
		"gold": 8,
		"health": 30,
		"level": 3,
		"experience": 0,
		"experienceToNext": 10,
		"boardCap": 3,
		"shopOdds": [55, 35, 10, 0, 0],
		"shop": [{ "heroId": "H01", "cost": 1, "rarity": 1 }, null, null, null, null],
		"shopLocked": false,
		"freeRefreshes": 0,
		"board": board,
		"bench": bench,
		"items": [],
		"rewardHeroes": [],
		"traits": [{ "traitId": "R_CAT", "count": 1, "activeBreakpoint": 0, "nextBreakpoint": 2 }],
		"actions": {
			"refreshShop": { "allowed": true },
			"lockShop": { "allowed": true },
			"buyXp": { "allowed": false, "reason": "NOT_ENOUGH_GOLD" },
			"startRound": { "allowed": true },
			"resolveCombat": { "allowed": false, "reason": "WRONG_PHASE" },
			"claimRoundReward": { "allowed": false, "reason": "WRONG_PHASE" },
			"claimRewardHero": { "allowed": false, "reason": "NO_PENDING_HERO_REWARD" },
			"buyShopSlots": [{ "allowed": true }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }, { "allowed": false, "reason": "SLOT_EMPTY" }],
		},
		"pendingReward": {
			"round": 1,
			"supplementalGold": 0,
			"freeRefreshes": 0,
			"offers": [],
		},
	}

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS adventure_view_model_test")
	quit(0)
