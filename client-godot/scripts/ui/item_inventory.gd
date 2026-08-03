class_name ItemInventory
extends RefCounted

const MAX_ITEMS_PER_HERO := 2

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
	var prefix := "Unique" if String(item.get("kind", "")) == "unique" else "Item"
	return "%s %s" % [prefix, String(item.get("itemId", "?"))]
