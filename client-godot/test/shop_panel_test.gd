extends SceneTree

const HeroCardScript = preload("res://scripts/ui/hero_card.gd")
const ShopPanelScript = preload("res://scripts/ui/shop_panel.gd")

var _failed := false

func _init() -> void:
	var catalog := {
		"H01": { "display_name": "Cotton Bulwark", "species": "cat", "role": "guardian", "source_sprite": "h01-cotton-shield-cat-chibi-v2.png" },
		"H02": { "display_name": "Ember Duelist", "species": "cat", "role": "fighter", "source_sprite": "h02-ember-duelist-cat-chibi-v2.png" },
		"H03": { "display_name": "Forest Ranger", "species": "cat", "role": "ranger", "source_sprite": "h03-forest-ranger-cat-chibi-v2.png" },
		"H04": { "display_name": "Frost Mage", "species": "cat", "role": "mage", "source_sprite": "h04-frost-mage-cat-chibi-v2.png" },
		"H20": { "display_name": "Capybara Guardian", "species": "exotic", "role": "guardian", "source_sprite": "h20-capybara-guardian-chibi-v3.png" },
		"U01": { "display_name": "Unique Test", "is_unique_hero": true },
	}
	var panel = ShopPanelScript.new()
	panel.set_catalog(catalog)
	panel.set_purchase_context(12, 1, true, 0)
	panel.bind_shop(_five_slots(), { "tier1": 45, "tier2": 35, "tier3": 18, "tier4": 2, "tier5": 0 }, false)
	_expect(_hero_card_count(panel) == 5, "Shop must render exactly five offer cards")
	var third = panel.find_child("BuySlot2", true, false)
	_expect(third != null and third.cost_text == "3 Gold" and third.rarity_text == "Tier 3" and third.star_text == "★★★", "Hero cards must represent the authoritative cost, rarity, and star tier")
	var hero_name: Label = third.find_child("HeroName", true, false) as Label
	var faction_class: Label = third.find_child("FactionClass", true, false) as Label
	_expect(hero_name.autowrap_mode == TextServer.AUTOWRAP_OFF and hero_name.clip_text and hero_name.position.y + hero_name.size.y <= faction_class.position.y, "Hero name and faction/class labels must reserve separate vertical space on compact cards")
	_expect(_label(panel, "TierOdds") == "T1 45%  T2 35%  T3 18%  T4 2%  T5 0%", "Shop must render server-provided tier odds")
	_expect(panel.find_child("LockShop", true, false) == null and _label(panel, "LockUnavailable") == "Lock unavailable: server support pending", "Unsupported shop locking must be explained without a fake interactive control")

	var intents: Array = []
	panel.buy_shop_slot.connect(func(index: int) -> void: intents.append(["buy", index]))
	panel.refresh_shop.connect(func() -> void: intents.append(["refresh"]))
	(panel.find_child("BuySlot0", true, false) as Button).pressed.emit()
	(panel.find_child("RefreshShop", true, false) as Button).pressed.emit()
	_expect(intents == [["buy", 0], ["refresh"]], "Shop controls must emit presentation intents instead of mutating economy or pool state")

	panel.set_purchase_context(2, 1, true, 0)
	_expect((panel.find_child("BuySlot2", true, false) as Button).disabled, "A hero must be disabled when authoritative gold is insufficient")
	panel.set_purchase_context(12, 8, true, 0)
	_expect((panel.find_child("BuySlot0", true, false) as Button).disabled, "A hero must be disabled when the authoritative bench is full")
	panel.set_purchase_context(12, 1, true, 0)
	var unique_slots := _five_slots()
	unique_slots[4] = { "heroId": "U01", "cost": 5, "rarity": 5 }
	panel.bind_shop(unique_slots, { "tier1": 30, "tier2": 35, "tier3": 25, "tier4": 9, "tier5": 1 }, false)
	var unique_card = panel.find_child("BuySlot4", true, false)
	_expect(unique_card != null and unique_card.is_unique_offer and unique_card.disabled, "Unique heroes must be absent from purchasable shop offers")
	_expect(_label(panel, "TierOdds") == "T1 30%  T2 35%  T3 25%  T4 9%  T5 1%", "Tier odds must update when the authoritative level view changes")
	panel.free()
	if _failed:
		quit(1)
		return
	print("PASS shop_panel_test")
	quit(0)

func _five_slots() -> Array:
	return [
		{ "heroId": "H01", "cost": 1, "rarity": 1 },
		{ "heroId": "H02", "cost": 2, "rarity": 2 },
		{ "heroId": "H03", "cost": 3, "rarity": 3 },
		{ "heroId": "H04", "cost": 4, "rarity": 4 },
		{ "heroId": "H20", "cost": 5, "rarity": 5 },
	]

func _hero_card_count(root: Node) -> int:
	var count := 0
	for child in root.get_children():
		if child.get_script() == HeroCardScript:
			count += 1
		count += _hero_card_count(child)
	return count

func _label(root: Node, node_name: String) -> String:
	var label: Label = root.find_child(node_name, true, false) as Label
	return label.text if label != null else ""

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
