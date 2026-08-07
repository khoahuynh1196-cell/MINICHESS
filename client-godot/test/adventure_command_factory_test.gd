extends SceneTree

const CommandFactoryScript = preload("res://scripts/adventure/adventure_command_factory.gd")

var _failed := false

func _init() -> void:
	_expect(CommandFactoryScript.refresh_shop("refresh", 3) == {
		"commandId": "refresh", "expectedRevision": 3, "type": "REFRESH_SHOP",
	}, "refresh payload must match the runtime protocol")
	_expect(CommandFactoryScript.lock_shop("lock", 4).type == "LOCK_SHOP", "lock payload must match the runtime protocol")
	_expect(CommandFactoryScript.buy_xp("xp", 5).type == "BUY_XP", "XP payload must match the runtime protocol")
	_expect(CommandFactoryScript.start_round("start", 6).type == "START_ROUND", "start payload must match the runtime protocol")
	_expect(CommandFactoryScript.resolve_combat("resolve", 7).type == "RESOLVE_COMBAT", "resolve payload must match the runtime protocol")
	_expect(CommandFactoryScript.ack_playback_complete("ack", 7).type == "ACK_PLAYBACK_COMPLETE", "ack payload must match the runtime protocol")
	_expect(CommandFactoryScript.buy_shop_hero("buy", 8, 2) == {
		"commandId": "buy", "expectedRevision": 8, "type": "BUY_SHOP_HERO", "shopSlotIndex": 2,
	}, "buy payload must contain the selected shop slot")
	_expect(CommandFactoryScript.move_hero("move", 9, "hero-a", "board", 15) == {
		"commandId": "move",
		"expectedRevision": 9,
		"type": "MOVE_HERO",
		"heroInstanceId": "hero-a",
		"destination": { "kind": "board", "index": 15 },
	}, "move payload must use local player-board destinations")
	_expect(CommandFactoryScript.sell_hero("sell", 10, "hero-a").heroInstanceId == "hero-a", "sell payload must identify its hero")
	_expect(CommandFactoryScript.equip_item("equip", 11, "item-a", "hero-a") == {
		"commandId": "equip",
		"expectedRevision": 11,
		"type": "EQUIP_ITEM",
		"itemInstanceId": "item-a",
		"heroInstanceId": "hero-a",
	}, "equip payload must identify both item and hero")
	_expect(CommandFactoryScript.unequip_item("unequip", 12, "item-a").itemInstanceId == "item-a", "unequip payload must identify its item")
	_expect(CommandFactoryScript.claim_reward_hero("claim-hero", 13, "reward-a").heroInstanceId == "reward-a", "hero reward payload must identify its queued instance")

	var selections := [{ "offerId": "offer-a", "optionId": "option-a" }]
	var reward_payload := CommandFactoryScript.claim_round_reward("claim-round", 14, selections)
	selections[0]["optionId"] = "mutated"
	_expect(reward_payload == {
		"commandId": "claim-round",
		"expectedRevision": 14,
		"type": "CLAIM_ROUND_REWARD",
		"selections": [{ "offerId": "offer-a", "optionId": "option-a" }],
	}, "reward selections must be deep copied")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS adventure_command_factory_test")
	quit(0)
