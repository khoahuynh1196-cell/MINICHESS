extends SceneTree

const TraitSummaryScript = preload("res://scripts/ui/trait_summary.gd")

var _failed := false

func _init() -> void:
	var board := [
		{ "instanceId": "a", "heroId": "H01" },
		{ "instanceId": "b", "heroId": "H02" },
		{ "instanceId": "b", "heroId": "H02" },
		null,
	]
	var summaries := TraitSummaryScript.summarize(board)
	var catfolk := summaries.filter(func(entry): return String(entry.id) == "species:cat")
	_expect(catfolk.size() == 1, "deployed heroes must produce a Catfolk trait")
	_expect(int(catfolk.front().count) == 2, "duplicate instance IDs and bench slots must not inflate traits")
	_expect(bool(catfolk.front().active), "two matching deployed heroes must activate a trait")
	_expect(TraitSummaryScript.text(board).contains("Cat"), "trait copy must be human-readable")
	if _failed:
		quit(1)
		return
	print("PASS trait_summary_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
