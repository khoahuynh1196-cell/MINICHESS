class_name AdventureTutorial
extends Panel

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

signal dismissed

var _cue: Label

func _init() -> void:
	name = "AdventureTutorial"
	mouse_filter = Control.MOUSE_FILTER_STOP
	add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(Color(ThemeTokensScript.STONE_RAISED, 0.94)))
	_cue = Label.new()
	_cue.name = "TutorialCueText"
	_cue.position = Vector2(16.0, 0.0)
	_cue.size = Vector2(468.0, 48.0)
	_cue.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_cue.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_cue.add_theme_font_size_override("font_size", 15)
	_cue.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	_cue.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_cue)
	var dismiss := Button.new()
	dismiss.name = "DismissTutorialCue"
	dismiss.text = "GOT IT"
	dismiss.position = Vector2(500.0, 4.0)
	dismiss.size = Vector2(112.0, 40.0)
	dismiss.tooltip_text = "Dismiss this round's Adventure tip"
	dismiss.add_theme_font_size_override("font_size", 14)
	dismiss.pressed.connect(_dismiss)
	add_child(dismiss)

func bind_round(round: int, is_dismissed: bool = false) -> void:
	_cue.text = cue_for_round(round)
	visible = not is_dismissed

func _dismiss() -> void:
	hide()
	dismissed.emit()

func set_dismiss_enabled(enabled: bool) -> void:
	var dismiss := find_child("DismissTutorialCue", true, false) as Button
	if dismiss != null:
		dismiss.disabled = not enabled

func cue_for_round(round: int) -> String:
	match round:
		1:
			return "Buy a hero, then deploy it to your formation."
		2:
			return "Roll the shop and merge three matching heroes to upgrade."
		3:
			return "Build traits by fielding heroes from the same group."
		4:
			return "A Unique reward can transform a hero; inspect it before equipping."
		5:
			return "Equip an item on the hero that benefits most from its stats."
		6:
			return "Position sturdy heroes up front to protect fragile allies."
		7:
			return "Fill your team, then refine positions before battle."
		8:
			return "The final boss is here. Set your full team and begin the final battle."
		_:
			return "Prepare your formation, then begin the next Adventure round."
