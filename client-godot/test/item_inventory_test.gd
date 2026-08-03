extends SceneTree

const ItemInventoryScript = preload("res://scripts/ui/item_inventory.gd")
const ItemMetadataCatalogScript = preload("res://scripts/ui/item_metadata_catalog.gd")

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
	var iron_blade_source := _authoritative_item("I01")
	_expect(ItemInventoryScript.item_tooltip({ "instanceId": "free", "itemId": "I01", "kind": "normal" }).contains(String(iron_blade_source.get("category", ""))), "item tooltip category must be derived from the authoritative content bundle")
	var dawn_crest_source := _authoritative_item("I10")
	var dawn_trigger: Dictionary = Array(dawn_crest_source.get("triggers", [])).front()
	var dawn_effect: Dictionary = Array(dawn_trigger.get("effects", [])).front()
	var dawn_tooltip := ItemInventoryScript.item_tooltip({ "instanceId": "dawn", "itemId": "I10", "kind": "normal" }).to_lower()
	_expect(dawn_tooltip.contains(String(dawn_trigger.get("when", "")).replace("_", " ")) and dawn_tooltip.contains(String(dawn_effect.get("primitive", "")).replace("_", " ")), "item tooltip must express the authoritative I10 combat trigger and effect, not only a trigger count")
	for source_item in _authoritative_items():
		var exported_item := ItemMetadataCatalogScript.item_metadata(String(source_item.get("id", "")))
		_expect(String(exported_item.get("name", "")) == String(source_item.get("name", "")) and String(exported_item.get("kind", "")) == String(source_item.get("kind", "")) and String(exported_item.get("category", "unique")) == String(source_item.get("category", "unique")) and Array(exported_item.get("stat_modifiers", [])) == Array(source_item.get("stat_modifiers", [])), "client item metadata must stay generated from authoritative item content")
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

func _authoritative_item(item_id: String) -> Dictionary:
	for item in _authoritative_items():
		if String(item.get("id", "")) == item_id:
			return item
	return {}

func _authoritative_items() -> Array:
	var workspace_root := ProjectSettings.globalize_path("res://")
	var file := FileAccess.open(workspace_root.path_join("../content/alpha-0.3.0/bundle.json").simplify_path(), FileAccess.READ)
	if file == null:
		return []
	var bundle = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(bundle) != TYPE_DICTIONARY:
		return []
	return Array(bundle.get("normal_items", [])) + Array(bundle.get("unique_items", []))
