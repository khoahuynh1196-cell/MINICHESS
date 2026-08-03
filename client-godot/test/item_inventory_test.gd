extends SceneTree

const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")

var _failed := false

func _init() -> void:
	var items := [
		{ "instanceId": "first", "itemId": "I01", "kind": "normal", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "second", "itemId": "I02", "kind": "normal", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "third", "itemId": "I03", "kind": "normal" },
	]
	_expect(not bool(ItemInventoryScript.equip_result(items, "third", "hero-a").allowed), "third item must be rejected before sending a command")
	items = [
		{ "instanceId": "unique-one", "itemId": "U01", "kind": "unique", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "unique-two", "itemId": "U02", "kind": "unique" },
	]
	var unique_result := ItemInventoryScript.equip_result(items, "unique-two", "hero-a")
	_expect(not bool(unique_result.allowed) and String(unique_result.reason).contains("Unique"), "second Unique item must explain its limit")
	_expect(bool(ItemInventoryScript.equip_result([{ "instanceId": "free", "itemId": "I01", "kind": "normal" }], "free", "hero-b").allowed), "free item must be equipable")
	if _failed:
		quit(1)
		return
	print("PASS item_inventory_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
