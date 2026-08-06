class_name RulesetCatalog
extends RefCounted

const DEFAULT_PATH := "res://assets/rules/production-rules-0.1.0.json"

static func load_ruleset(path: String = DEFAULT_PATH) -> Dictionary:
	if not FileAccess.file_exists(path):
		push_error("Ruleset file does not exist: %s" % path)
		return {}
	var file := FileAccess.open(path, FileAccess.READ)
	if file == null:
		push_error("Ruleset file could not be opened: %s" % path)
		return {}
	var parsed = JSON.parse_string(file.get_as_text())
	file.close()
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Ruleset root must be a dictionary")
		return {}
	var rules: Dictionary = parsed
	if not _is_valid_ruleset(rules):
		return {}
	return rules.duplicate(true)

static func _is_valid_ruleset(rules: Dictionary) -> bool:
	if String(rules.get("version", "")).is_empty():
		push_error("Ruleset version is missing")
		return false
	var combat_value = rules.get("combat", null)
	var board_value = rules.get("board", null)
	var roster_value = rules.get("roster", null)
	var shop_value = rules.get("shop", null)
	var progression_value = rules.get("progression", null)
	var adventure_value = rules.get("adventure", null)
	if typeof(combat_value) != TYPE_DICTIONARY or typeof(board_value) != TYPE_DICTIONARY \
		or typeof(roster_value) != TYPE_DICTIONARY or typeof(shop_value) != TYPE_DICTIONARY \
		or typeof(progression_value) != TYPE_DICTIONARY or typeof(adventure_value) != TYPE_DICTIONARY:
		push_error("Ruleset is missing a required section")
		return false
	var combat: Dictionary = combat_value
	var board: Dictionary = board_value
	var roster: Dictionary = roster_value
	var shop: Dictionary = shop_value
	var progression: Dictionary = progression_value
	var adventure: Dictionary = adventure_value
	if int(combat.get("tick_rate", 0)) <= 0 or int(combat.get("max_ticks", 0)) <= 0:
		push_error("Ruleset combat values are invalid")
		return false
	if int(board.get("columns", 0)) <= 0 or int(board.get("rows", 0)) <= 0 or String(board.get("movement", "")) != "orthogonal":
		push_error("Ruleset board values are invalid")
		return false
	if typeof(board.get("enemy_rows", null)) != TYPE_DICTIONARY or typeof(board.get("player_rows", null)) != TYPE_DICTIONARY:
		push_error("Ruleset board side rows are missing")
		return false
	if int(roster.get("bench_slots", 0)) <= 0 or int(roster.get("max_items_per_hero", 0)) <= 0 or int(roster.get("max_unique_per_team", 0)) <= 0:
		push_error("Ruleset roster values are invalid")
		return false
	if int(shop.get("slot_count", 0)) <= 0 or typeof(shop.get("odds_by_level", null)) != TYPE_DICTIONARY:
		push_error("Ruleset shop values are invalid")
		return false
	if int(progression.get("initial_level", 0)) <= 0 or int(progression.get("max_level", 0)) <= 0 or typeof(progression.get("levels", null)) != TYPE_ARRAY:
		push_error("Ruleset progression values are invalid")
		return false
	if int(adventure.get("round_count", 0)) <= 0 or int(adventure.get("unique_reveal_round", 0)) <= 0:
		push_error("Ruleset Adventure values are invalid")
		return false
	return true
