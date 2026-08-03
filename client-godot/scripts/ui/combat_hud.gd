class_name CombatHud
extends VBoxContainer

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

signal pause_requested
signal speed_requested(speed: float)

var pause_button: Button
var speed_1x_button: Button
var speed_2x_button: Button
var speed_label: Label
var event_label: Label

func _init() -> void:
	name = "CombatHud"
	add_theme_constant_override("separation", 12)
	var controls := HBoxContainer.new()
	controls.add_theme_constant_override("separation", 12)
	pause_button = Button.new()
	pause_button.name = "PauseReplayButton"
	pause_button.text = "Pause"
	pause_button.tooltip_text = "Pause replay presentation"
	pause_button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(pause_button, ThemeTokensScript.GOLD)
	pause_button.pressed.connect(func() -> void: pause_requested.emit())
	controls.add_child(pause_button)
	speed_1x_button = Button.new()
	speed_1x_button.name = "ReplaySpeed1xButton"
	speed_1x_button.text = "1x"
	speed_1x_button.tooltip_text = "Set replay presentation to normal speed"
	speed_1x_button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(speed_1x_button, ThemeTokensScript.STONE_RAISED)
	speed_1x_button.pressed.connect(func() -> void: speed_requested.emit(1.0))
	controls.add_child(speed_1x_button)
	speed_2x_button = Button.new()
	speed_2x_button.name = "ReplaySpeed2xButton"
	speed_2x_button.text = "2x"
	speed_2x_button.tooltip_text = "Set replay presentation to double speed"
	speed_2x_button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(speed_2x_button, ThemeTokensScript.STONE_RAISED)
	speed_2x_button.pressed.connect(func() -> void: speed_requested.emit(2.0))
	controls.add_child(speed_2x_button)
	speed_label = Label.new()
	speed_label.name = "ReplaySpeedAnnouncement"
	controls.add_child(speed_label)
	add_child(controls)
	event_label = Label.new()
	event_label.name = "CombatEventAnnouncement"
	event_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(event_label)
	bind_snapshot({})

func bind_snapshot(snapshot: Dictionary) -> void:
	var paused := bool(snapshot.get("paused", false))
	var speed := float(snapshot.get("playbackSpeed", snapshot.get("playback_speed", 1.0)))
	pause_button.text = "Play" if paused else "Pause"
	pause_button.tooltip_text = "Resume replay presentation" if paused else "Pause replay presentation"
	speed_label.text = "%sx" % _speed_text(speed)
	speed_label.tooltip_text = "Replay presentation speed %s" % speed_label.text

func present_event(event) -> void:
	var event_type := str(event.get("type") if event is Dictionary else event.type)
	var payload: Dictionary = Dictionary(event.get("payload", {}) if event is Dictionary else event.payload)
	var announcement := _announcement(event_type, payload)
	event_label.text = announcement
	# The tooltip mirrors visible text so assistive services have a stable label.
	event_label.tooltip_text = announcement

func _speed_text(speed: float) -> String:
	return str(int(speed)) if is_equal_approx(speed, roundf(speed)) else str(speed)

func _announcement(event_type: String, payload: Dictionary) -> String:
	match event_type:
		"DAMAGE_APPLIED":
			return "Damage%s" % (": %s" % payload.get("amount") if payload.has("amount") else " applied")
		"HEAL_APPLIED":
			return "Heal%s" % (": %s" % payload.get("amount") if payload.has("amount") else " applied")
		"SHIELD_APPLIED":
			return "Shield applied"
		"STUN_APPLIED":
			return "Stun applied"
		"SLOW_APPLIED":
			return "Slow applied"
		"CAST_STARTED", "CAST_RESOLVED":
			return "Ability cast"
		_:
			return event_type.replace("_", " ").capitalize()
