extends SceneTree

const RulesetCatalogScript = preload("res://scripts/rules/ruleset_catalog.gd")

var _failed := false

func _init() -> void:
	var rules := RulesetCatalogScript.load_ruleset()
	_expect(not rules.is_empty(), "canonical ruleset must load")
	_expect(String(rules.get("version", "")) == "production-rules-0.1.0", "ruleset version must match the authored contract")
	var combat: Dictionary = rules.get("combat", {})
	var board: Dictionary = rules.get("board", {})
	var roster: Dictionary = rules.get("roster", {})
	var shop: Dictionary = rules.get("shop", {})
	var progression: Dictionary = rules.get("progression", {})
	_expect(int(combat.get("tick_rate", 0)) == 20 and int(combat.get("max_ticks", 0)) == 700, "combat timing must come from the generated ruleset")
	_expect(int(board.get("columns", 0)) == 4 and int(board.get("rows", 0)) == 8, "Godot must load the canonical 4x8 board")
	_expect(int(roster.get("bench_slots", 0)) == 8, "bench capacity must come from rules")
	_expect(int(shop.get("slot_count", 0)) == 5, "shop size must come from rules")
	_expect(int(progression.get("initial_level", 0)) == 3 and int(progression.get("max_level", 0)) == 9, "progression levels must come from rules")
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS ruleset_catalog_test")
	quit(0)
