extends SceneTree

const AudioFeedbackScript = preload("res://scripts/audio_feedback.gd")
const AssetManifestScript = preload("res://scripts/presentation/asset_manifest.gd")
const HeroSfxBusScript = preload("res://scripts/presentation/hero_sfx_bus.gd")

var _failed := false

func _init() -> void:
	var feedback = AudioFeedbackScript.new()
	feedback.configure({ "sound": false, "haptics": false })
	_expect(not feedback.play_cue(null, "chime"), "disabled sound must suppress cues")
	_expect(not feedback.request_haptic("reward"), "disabled haptics must suppress vibration")
	feedback.configure({ "sound": true, "haptics": true })
	_expect(AssetManifestScript.validate_audio_cues(AudioFeedbackScript.CUE_IDS).is_empty(), "every approved cue ID must resolve a shipped audio asset")
	for cue_id in AudioFeedbackScript.CUE_IDS:
		var authored_stream: AudioStream = HeroSfxBusScript.resolve_cue_stream(cue_id)
		_expect(authored_stream != null and authored_stream.resource_path.ends_with(".wav"), "%s must prefer its shipped WAV cue" % cue_id)
	var fallback_stream: AudioStream = HeroSfxBusScript.resolve_cue_stream("missing-cue")
	_expect(fallback_stream is AudioStreamWAV and fallback_stream.resource_path.is_empty(), "missing authored cues must retain the procedural stream fallback")
	_expect(not feedback.play_cue(null, ""), "missing cues must be rejected")
	_expect(not feedback.play_cue(null, "not-a-real-cue"), "unknown cues must be rejected with diagnostics")
	_expect(not feedback.request_haptic("unknown"), "unknown haptic types must be rejected")
	_expect(feedback.request_haptic("defeat"), "the approved defeat haptic must be available")
	_expect(Array(feedback.haptic_requests) == ["defeat"], "approved haptic requests must be observable for presentation tests")
	_expect(feedback.diagnostics.size() == 3, "invalid feedback requests must retain diagnostics")
	if _failed:
		quit(1)
		return
	print("PASS audio_feedback_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
