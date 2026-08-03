extends SceneTree

const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var controller = BattleControllerScript.new()
	_expect(controller.collection_hero_ids().size() == 20, "collection must expose all current roster heroes")
	controller.set_collection_filters("cat", "mage")
	_expect(controller.collection_hero_ids() == ["H04"], "collection filters must intersect species and role")
	controller.set_collection_filters("unknown", "unknown")
	_expect(controller.collection_hero_ids().size() == 20, "invalid filters must safely reset to all heroes")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS collection_screen_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
