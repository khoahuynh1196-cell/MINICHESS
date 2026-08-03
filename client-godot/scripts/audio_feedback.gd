class_name AudioFeedback
extends RefCounted

const HeroSfxBusScript = preload("res://scripts/presentation/hero_sfx_bus.gd")
const HAPTIC_DURATIONS_MS := { "buy": 10, "combine": 18, "reward": 20, "defeat": 28 }

var settings: Dictionary = {}
var diagnostics: PackedStringArray = []

func configure(next_settings: Dictionary) -> void:
	settings = next_settings.duplicate(true)

func play_cue(host: Node, cue_id: String) -> bool:
	if not bool(settings.get("sound", true)):
		return false
	if cue_id.is_empty():
		_diagnose("Missing audio cue")
		return false
	HeroSfxBusScript.play_cue(host, cue_id)
	return true

func request_haptic(kind: String) -> bool:
	if not bool(settings.get("haptics", true)):
		return false
	if not HAPTIC_DURATIONS_MS.has(kind):
		_diagnose("Unknown haptic cue: %s" % kind)
		return false
	Input.vibrate_handheld(int(HAPTIC_DURATIONS_MS[kind]))
	return true

func _diagnose(message: String) -> void:
	diagnostics.append(message)
	push_warning(message)
