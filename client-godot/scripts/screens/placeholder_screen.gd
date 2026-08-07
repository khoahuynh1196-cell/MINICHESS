class_name PlaceholderScreen
extends Control

## Stand-in for a screen this mission's scoped-down pass did not build a
## real presentation for yet (home/combat/reward/result/collection/
## settings beyond Prepare). It still renders real domain data -- phase,
## round, gold, health -- so the navigation skeleton is verifiably driven
## by the actual Adventure view rather than faked. See
## docs/evidence/offline-foundation-progress.md Mission 7 for the tracked
## follow-up (real presenters/scenes per screen, matching Prepare's pattern).

var _label: Label
var screen_id := ""

func _init(id: String = "") -> void:
	screen_id = id
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label = Label.new()
	_label.name = "Label"
	_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	add_child(_label)
	_render({})

func bind(view: Dictionary) -> void:
	_render(view)

func _render(view: Dictionary) -> void:
	_label.text = "%s\nphase=%s round=%s gold=%s hp=%s" % [
		screen_id.capitalize(), view.get("phase", "-"), view.get("round", "-"),
		view.get("gold", "-"), view.get("health", "-"),
	]
