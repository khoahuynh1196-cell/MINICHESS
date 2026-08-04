class_name ItemInventory
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const ItemMetadataCatalogScript = preload("res://scripts/ui/item_metadata_catalog.gd")
const ItemDragButtonScript = preload("res://scripts/ui/item_drag_button.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const MAX_ITEMS_PER_HERO := 2

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
		var button: Button
		if equipped:
			button = Button.new()
		else:
			var drag_button = ItemDragButtonScript.new()
			drag_button.configure_item(String(item.get("instanceId", "")))
			button = drag_button
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
	chooser.tooltip_text = "Accessible alternate: equip the selected item to %s" % _hero_display_name(Dictionary(targets.front()))
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
	return String(ItemMetadataCatalogScript.item_metadata(item_id).get("name", "Unknown item"))

static func item_tooltip(item: Dictionary) -> String:
	var item_id := String(item.get("itemId", "?"))
	var authored := ItemMetadataCatalogScript.item_metadata(item_id)
	if not authored.has("name"):
		authored["name"] = "Unknown item"
	var kind := String(authored.get("kind", item.get("kind", "normal"))).capitalize()
	var category := String(authored.get("category", ""))
	var details: Array[String] = []
	for modifier in Array(authored.get("stat_modifiers", [])):
		var value := int(modifier.get("value", 0))
		var suffix := "%" if String(modifier.get("mode", "")) == "percent" else ""
		details.append("%s: +%d%s" % [_humanize(String(modifier.get("stat", ""))), value, suffix])
	for trigger in Array(authored.get("triggers", [])):
		details.append(_trigger_detail(trigger))
	return "%s\n%s item • %s\n%s\nSelect it, then tap or drag to a hero to equip." % [String(authored.get("name", item_id)), kind, category, "; ".join(details) if not details.is_empty() else "No authored effects"]

static func _hero_display_name(hero: Dictionary) -> String:
	return String(HeroVisualCatalogScript.profile(String(hero.get("heroId", ""))).get("display_name", "Unknown hero"))

static func _humanize(value: String) -> String:
	return value.capitalize().replace("_", " ")

static func _trigger_detail(trigger: Dictionary) -> String:
	var effect_names: Array[String] = []
	for effect in Array(trigger.get("effects", [])):
		effect_names.append(_humanize(String(effect.get("primitive", "effect"))))
	if effect_names.is_empty() and not String(trigger.get("kind", "")).is_empty():
		effect_names.append(_humanize(String(trigger.get("kind", "effect"))))
	return "%s: %s" % [_humanize(String(trigger.get("when", trigger.get("trigger", "combat trigger")))), ", ".join(effect_names) if not effect_names.is_empty() else "effect"]
