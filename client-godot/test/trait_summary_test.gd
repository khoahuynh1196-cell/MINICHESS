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
	var four_catfolk := TraitSummaryScript.summarize([
		{ "instanceId": "one", "heroId": "H01" }, { "instanceId": "two", "heroId": "H02" },
		{ "instanceId": "three", "heroId": "H03" }, { "instanceId": "four", "heroId": "H04" },
	]).filter(func(entry): return String(entry.id) == "species:cat")
	_expect(not four_catfolk.is_empty() and int(four_catfolk.front().get("active_breakpoint", 0)) == 4, "trait summaries must expose the active 2/4/6 breakpoint")
	var six_catfolk := TraitSummaryScript.summarize([
		{ "instanceId": "six-one", "heroId": "H01" }, { "instanceId": "six-two", "heroId": "H02" }, { "instanceId": "six-three", "heroId": "H03" },
		{ "instanceId": "six-four", "heroId": "H04" }, { "instanceId": "six-five", "heroId": "H05" }, { "instanceId": "six-six", "heroId": "H01" },
	]).filter(func(entry): return String(entry.id) == "species:cat")
	_expect(not six_catfolk.is_empty() and int(six_catfolk.front().get("active_breakpoint", 0)) == 6, "six deployed matching heroes must expose the 6-piece breakpoint")
	if _failed:
		quit(1)
		return
	print("PASS trait_summary_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
