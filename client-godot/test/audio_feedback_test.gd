extends SceneTree

const AudioFeedbackScript = preload("res://scripts/audio_feedback.gd")

var _failed := false

func _init() -> void:
	var feedback = AudioFeedbackScript.new()
	feedback.configure({ "sound": false, "haptics": false })
	_expect(not feedback.play_cue(null, "chime"), "disabled sound must suppress cues")
	_expect(not feedback.request_haptic("reward"), "disabled haptics must suppress vibration")
	feedback.configure({ "sound": true, "haptics": true })
	_expect(not feedback.play_cue(null, ""), "missing cues must be rejected")
	_expect(not feedback.request_haptic("unknown"), "unknown haptic types must be rejected")
	_expect(feedback.diagnostics.size() == 2, "invalid feedback requests must retain diagnostics")
	if _failed:
		quit(1)
		return
	print("PASS audio_feedback_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
