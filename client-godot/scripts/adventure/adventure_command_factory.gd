class_name AdventureCommandFactory
extends RefCounted

static func refresh_shop(command_id: String, revision: int) -> Dictionary:
	return _simple(command_id, revision, "REFRESH_SHOP")

static func lock_shop(command_id: String, revision: int) -> Dictionary:
	return _simple(command_id, revision, "LOCK_SHOP")

static func buy_xp(command_id: String, revision: int) -> Dictionary:
	return _simple(command_id, revision, "BUY_XP")

static func start_round(command_id: String, revision: int) -> Dictionary:
	return _simple(command_id, revision, "START_ROUND")

static func resolve_combat(command_id: String, revision: int) -> Dictionary:
	return _simple(command_id, revision, "RESOLVE_COMBAT")

static func buy_shop_hero(command_id: String, revision: int, shop_slot_index: int) -> Dictionary:
	return _base(command_id, revision, "BUY_SHOP_HERO").merged({
		"shopSlotIndex": shop_slot_index,
	})

static func move_hero(command_id: String, revision: int, hero_instance_id: String, destination_kind: String, destination_index: int) -> Dictionary:
	return _base(command_id, revision, "MOVE_HERO").merged({
		"heroInstanceId": hero_instance_id,
		"destination": {
			"kind": destination_kind,
			"index": destination_index,
		},
	})

static func sell_hero(command_id: String, revision: int, hero_instance_id: String) -> Dictionary:
	return _base(command_id, revision, "SELL_HERO").merged({
		"heroInstanceId": hero_instance_id,
	})

static func equip_item(command_id: String, revision: int, item_instance_id: String, hero_instance_id: String) -> Dictionary:
	return _base(command_id, revision, "EQUIP_ITEM").merged({
		"itemInstanceId": item_instance_id,
		"heroInstanceId": hero_instance_id,
	})

static func unequip_item(command_id: String, revision: int, item_instance_id: String) -> Dictionary:
	return _base(command_id, revision, "UNEQUIP_ITEM").merged({
		"itemInstanceId": item_instance_id,
	})

static func claim_reward_hero(command_id: String, revision: int, hero_instance_id: String) -> Dictionary:
	return _base(command_id, revision, "CLAIM_REWARD_HERO").merged({
		"heroInstanceId": hero_instance_id,
	})

static func claim_round_reward(command_id: String, revision: int, selections: Array) -> Dictionary:
	var copied_selections: Array = []
	for selection in selections:
		if selection is Dictionary:
			copied_selections.append(Dictionary(selection).duplicate(true))
	return _base(command_id, revision, "CLAIM_ROUND_REWARD").merged({
		"selections": copied_selections,
	})

static func _simple(command_id: String, revision: int, command_type: String) -> Dictionary:
	return _base(command_id, revision, command_type)

static func _base(command_id: String, revision: int, command_type: String) -> Dictionary:
	return {
		"commandId": command_id,
		"expectedRevision": revision,
		"type": command_type,
	}
