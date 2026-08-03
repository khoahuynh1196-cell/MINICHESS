class_name ItemInventory
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const MAX_ITEMS_PER_HERO := 2
const ITEM_CONTENT := {
	"I01": { "name": "Iron Blade", "detail": "+100% Attack Damage" },
	"I02": { "name": "Swift Bow", "detail": "+150% Attack Speed" },
	"I03": { "name": "Arcane Tome", "detail": "+150 Skill Power" },
	"I04": { "name": "Focus Core", "detail": "+150 Starting Mana" },
	"I05": { "name": "Guardian Plate", "detail": "+200 Armor" },
	"I06": { "name": "Spirit Cloak", "detail": "+200 Magic Resist" },
	"I07": { "name": "Vital Belt", "detail": "+150% Max Health" },
	"I08": { "name": "Hunter Gloves", "detail": "+15% Critical Chance" },
	"I09": { "name": "Blood Charm", "detail": "+15% Lifesteal" },
	"I10": { "name": "Dawn Crest", "detail": "Gain a shield at combat start" },
	"I11": { "name": "Spark Orb", "detail": "Damages the target after a skill" },
	"I12": { "name": "Frost Sigil", "detail": "Basic attacks periodically slow targets" },
	"U01": { "name": "Lion Crown", "detail": "+150% Max Health; stuns adjacent foes below half health" },
	"U02": { "name": "White Wolf Claw", "detail": "+150% Attack Speed; every third attack strikes harder" },
	"U03": { "name": "Ancient Turtle Shell", "detail": "+200% Armor and Magic Resist; gains a combat-start shield" },
	"U04": { "name": "Star Unicorn Horn", "detail": "+150 Starting Mana; first cast heals the weakest ally" },
	"U05": { "name": "Nine-Tail Fox Mask", "detail": "+100% Skill Power; first cast summons a decoy" },
	"U06": { "name": "Red Phoenix Feather", "detail": "+100% Attack Damage and Skill Power; cleanses and shields at low health" },
}

signal item_selected(item_instance_id: String)
signal equip_requested(item_instance_id: String, hero_instance_id: String)
signal unequip_requested(item_instance_id: String)

func bind_inventory(items: Array, heroes: Array, selected_item_instance_id: String, enabled: bool, feedback: String = "") -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	_add_label("InventoryHeading", "INVENTORY", Rect2(24.0, 14.0, 170.0, 28.0), ThemeTokensScript.GOLD)
	var prompt := feedback if not feedback.is_empty() else "Select an item, then tap a hero to equip."
	_add_label("InventoryFeedback", prompt, Rect2(205.0, 14.0, 755.0, 28.0), ThemeTokensScript.PARCHMENT)
	if items.is_empty():
		_add_label("InventoryEmpty", "No items held", Rect2(205.0, 56.0, 735.0, 44.0), ThemeTokensScript.MUTED)
		return
	for index in items.size():
		var item: Dictionary = items[index]
		var column := index % 5
		var row := index / 5
		var equipped := item.has("equippedHeroInstanceId")
		var selected := String(item.get("instanceId", "")) == selected_item_instance_id
		var button := Button.new()
		button.name = "InventoryItem%d" % index
		button.text = ("Unequip " if equipped else "Use ") + item_label(item)
		button.position = Vector2(205.0 + column * 153.0, 52.0 + row * 48.0)
		button.size = Vector2(145.0, ThemeTokensScript.TOUCH_TARGET)
		button.focus_mode = Control.FOCUS_ALL
		button.tooltip_text = item_tooltip(item)
		button.disabled = not enabled
		ThemeTokensScript.apply_button_style(button, ThemeTokensScript.PLAYER if selected else ThemeTokensScript.STONE_RAISED if equipped else ThemeTokensScript.GOLD)
		if equipped:
			button.pressed.connect(func() -> void: unequip_requested.emit(String(item.get("instanceId", ""))))
		else:
			button.pressed.connect(func() -> void: item_selected.emit(String(item.get("instanceId", ""))))
		add_child(button)
	if not selected_item_instance_id.is_empty():
		_add_hero_targets(heroes, selected_item_instance_id, enabled)

func _add_hero_targets(heroes: Array, item_instance_id: String, enabled: bool) -> void:
	var targets := heroes.filter(func(hero): return hero != null)
	if targets.is_empty():
		return
	var chooser := Button.new()
	chooser.name = "InventoryHeroTarget"
	chooser.text = "Equip selected item to first listed hero"
	chooser.position = Vector2(24.0, 96.0)
	chooser.size = Vector2(170.0, ThemeTokensScript.TOUCH_TARGET)
	chooser.focus_mode = Control.FOCUS_ALL
	chooser.tooltip_text = "Accessible alternate: equip the selected item to %s" % String(targets.front().get("heroId", "hero"))
	chooser.disabled = not enabled
	ThemeTokensScript.apply_button_style(chooser, ThemeTokensScript.PLAYER)
	chooser.pressed.connect(func() -> void: equip_requested.emit(item_instance_id, String(targets.front().get("instanceId", ""))))
	add_child(chooser)

func _add_label(node_name: String, text: String, rect: Rect2, color: Color) -> void:
	var label := Label.new()
	label.name = node_name
	label.text = text
	label.position = rect.position
	label.size = rect.size
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_META)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)

# Mirrors visible equip limits so the player receives immediate feedback.
static func equip_result(items: Array, item_instance_id: String, hero_instance_id: String) -> Dictionary:
	if item_instance_id.is_empty() or hero_instance_id.is_empty():
		return { "allowed": false, "reason": "Choose an item and a hero" }
	var candidate: Dictionary = {}
	var equipped: Array = []
	for item in items:
		if String(item.get("instanceId", "")) == item_instance_id:
			candidate = item
		if String(item.get("equippedHeroInstanceId", "")) == hero_instance_id:
			equipped.append(item)
	if candidate.is_empty() or candidate.has("equippedHeroInstanceId"):
		return { "allowed": false, "reason": "That item is no longer available" }
	if equipped.size() >= MAX_ITEMS_PER_HERO:
		return { "allowed": false, "reason": "A hero can hold only two items" }
	if String(candidate.get("kind", "")) == "unique" and equipped.any(func(item): return String(item.get("kind", "")) == "unique"):
		return { "allowed": false, "reason": "A hero can hold only one Unique item" }
	return { "allowed": true, "reason": "" }

static func item_label(item: Dictionary) -> String:
	var item_id := String(item.get("itemId", "?"))
	return String(Dictionary(ITEM_CONTENT.get(item_id, {})).get("name", item_id))

static func item_tooltip(item: Dictionary) -> String:
	var item_id := String(item.get("itemId", "?"))
	var authored: Dictionary = Dictionary(ITEM_CONTENT.get(item_id, {}))
	var rarity := "Unique item" if String(item.get("kind", "")) == "unique" else "Normal item"
	return "%s\n%s\n%s\nSelect it, then tap a hero to equip." % [String(authored.get("name", item_id)), rarity, String(authored.get("detail", "Authored effect unavailable"))]
