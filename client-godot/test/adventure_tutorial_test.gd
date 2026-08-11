extends SceneTree

var _failed := false

func _init() -> void:
	var tutorial_script := load("res://scripts/ui/adventure_tutorial.gd") as GDScript
	var tutorial = tutorial_script.new() if tutorial_script != null else null
	_expect(tutorial != null and tutorial.cue_for_round(1).contains("Buy") and tutorial.cue_for_round(1).contains("deploy"), "Round 1 must teach buying and deploying")
	_expect(tutorial != null and tutorial.cue_for_round(8).contains("final boss"), "Round 8 must prepare the player for the final boss")
	if tutorial != null:
		var distinct_cues: Dictionary = {}
		for round in range(1, 9):
			var cue: String = String(tutorial.cue_for_round(round))
			_expect(not cue.is_empty(), "Each Adventure round must have a tutorial cue")
			distinct_cues[cue] = true
		_expect(distinct_cues.size() == 8, "All eight Adventure rounds must provide distinct tutorial cues")
	if tutorial != null:
		tutorial.bind_round(1)
	var dismiss := tutorial.find_child("DismissTutorialCue", true, false) as Button if tutorial != null else null
	if dismiss != null:
		dismiss.pressed.emit()
	_expect(tutorial != null and dismiss != null and not tutorial.visible, "Tutorial cues must be dismissible without changing Adventure state")
	if tutorial != null:
		tutorial.free()
	if _failed:
		quit(1)
		return
	print("PASS adventure_tutorial_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
