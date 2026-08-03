class_name TraitSummary
extends RefCounted

const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")
const BREAKPOINTS := [2, 4, 6]

# This is presentation-only. The server remains responsible for trait effects.
static func summarize(board: Array) -> Array[Dictionary]:
	var counts := {}
	var seen_instances := {}
	for hero in board:
		if hero == null:
			continue
		var instance_id := String(hero.get("instanceId", ""))
		if not instance_id.is_empty() and seen_instances.has(instance_id):
			continue
		if not instance_id.is_empty():
			seen_instances[instance_id] = true
		var hero_id := String(hero.get("heroId", ""))
		if not HeroVisualCatalogScript.hero_ids().has(hero_id):
			continue
		var profile: Dictionary = HeroVisualCatalogScript.profile(hero_id)
		_increment(counts, "species", String(profile.species))
		_increment(counts, "role", String(profile.role))
	var summaries: Array[Dictionary] = []
	for kind in ["species", "role"]:
		for trait_id in counts.get(kind, {}):
			var count: int = int(counts[kind][trait_id])
			var target := _next_breakpoint(count)
			summaries.append({
				"id": "%s:%s" % [kind, trait_id],
				"kind": kind,
				"name": _display_name(trait_id),
				"count": count,
				"target": target,
				"active": count >= BREAKPOINTS.front(),
			})
	summaries.sort_custom(func(left: Dictionary, right: Dictionary) -> bool: return String(left.id) < String(right.id))
	return summaries

static func text(board: Array) -> String:
	var entries: Array[String] = []
	for summary in summarize(board):
		entries.append("%s %d/%d%s" % [String(summary.name), int(summary.count), int(summary.target), " active" if bool(summary.active) else ""])
	return "No active traits" if entries.is_empty() else "  |  ".join(entries)

static func _increment(counts: Dictionary, kind: String, trait_id: String) -> void:
	if trait_id.is_empty():
		return
	if not counts.has(kind):
		counts[kind] = {}
	counts[kind][trait_id] = int(counts[kind].get(trait_id, 0)) + 1

static func _next_breakpoint(count: int) -> int:
	for threshold in BREAKPOINTS:
		if count <= threshold:
			return threshold
	return BREAKPOINTS.back()

static func _display_name(value: String) -> String:
	return value.capitalize()
