extends SceneTree

const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")

var _failed := false

func _init() -> void:
	var items := [
		{ "instanceId": "first", "itemId": "I01", "kind": "normal", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "second", "itemId": "I02", "kind": "normal", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "third", "itemId": "I03", "kind": "normal" },
	]
	var two_item_result := ItemInventoryScript.equip_result(items, "third", "hero-a")
	_expect(not bool(two_item_result.allowed) and String(two_item_result.reason) == "A hero can hold only two items", "third item must be rejected with immediate two-item feedback")
	items = [
		{ "instanceId": "unique-one", "itemId": "U01", "kind": "unique", "equippedHeroInstanceId": "hero-a" },
		{ "instanceId": "unique-two", "itemId": "U02", "kind": "unique" },
	]
	var unique_result := ItemInventoryScript.equip_result(items, "unique-two", "hero-a")
	_expect(not bool(unique_result.allowed) and String(unique_result.reason).contains("Unique"), "second Unique item must explain its limit")
	_expect(bool(ItemInventoryScript.equip_result([{ "instanceId": "free", "itemId": "I01", "kind": "normal" }], "free", "hero-b").allowed), "free item must be equipable")
	_expect(ItemInventoryScript.item_label({ "instanceId": "free", "itemId": "I01", "kind": "normal" }) == "Iron Blade", "item labels must use authored content names")
	_expect(ItemInventoryScript.item_tooltip({ "instanceId": "free", "itemId": "I01", "kind": "normal" }).contains("Iron Blade") and ItemInventoryScript.item_tooltip({ "instanceId": "free", "itemId": "I01", "kind": "normal" }).contains("Attack Damage"), "item tooltips must include authored names and effects")
	var inventory := ItemInventoryScript.new()
	var equip_intents: Array = []
	inventory.equip_requested.connect(func(item_instance_id: String, hero_instance_id: String) -> void: equip_intents.append([item_instance_id, hero_instance_id]))
	inventory.bind_inventory([{ "instanceId": "free", "itemId": "I01", "kind": "normal" }], [{ "instanceId": "hero-b", "heroId": "H01" }], "free", true, String(two_item_result.reason))
	_expect(inventory.find_child("InventoryFeedback", true, false).text == "A hero can hold only two items", "inventory must render immediate command-preflight feedback")
	var alternate_target := inventory.find_child("InventoryHeroTarget", true, false) as Button
	if alternate_target != null:
		alternate_target.pressed.emit()
	_expect(equip_intents == [["free", "hero-b"]], "inventory must expose an accessible command-only equip intent")
	inventory.free()
	if _failed:
		quit(1)
		return
	print("PASS item_inventory_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
