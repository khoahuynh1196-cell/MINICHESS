class_name HeroSfxBus
extends Node

const MIX_RATE := 22050
const DEFAULT_GAIN_DB := -15.0

static func play_cue(host: Node, cue_id: String, gain_db: float = DEFAULT_GAIN_DB) -> void:
	if host == null or not host.is_inside_tree():
		return
	var player := AudioStreamPlayer.new()
	player.bus = &"Master"
	player.volume_db = gain_db
	player.stream = _make_stream(cue_id)
	host.add_child(player)
	player.finished.connect(player.queue_free)
	player.play()

static func _make_stream(cue_id: String) -> AudioStreamWAV:
	var duration := 0.16
	if cue_id in ["guard", "hammer", "charge", "defeat"]:
		duration = 0.24
	var samples: int = maxi(1, roundi(MIX_RATE * duration))
	var pcm := PackedByteArray()
	pcm.resize(samples * 2)
	for index in samples:
		var time := float(index) / float(MIX_RATE)
		var value := _sample(cue_id, time, duration)
		var encoded: int = clampi(roundi(clampf(value, -1.0, 1.0) * 32767.0), -32768, 32767)
		pcm[index * 2] = encoded & 0xff
		pcm[index * 2 + 1] = (encoded >> 8) & 0xff
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = MIX_RATE
	stream.data = pcm
	return stream

static func _sample(cue_id: String, time: float, duration: float) -> float:
	var progress := clampf(time / duration, 0.0, 1.0)
	var envelope := pow(1.0 - progress, 2.4)
	var frequency := 440.0
	var value := 0.0
	match cue_id:
		"guard":
			frequency = 118.0
			value = sin(TAU * frequency * time) + 0.4 * sin(TAU * frequency * 0.5 * time)
		"slash", "punch", "hit":
			frequency = lerpf(620.0, 120.0, progress)
			value = sin(TAU * frequency * time) + sin(TAU * 89.0 * time) * 0.4
		"bow":
			frequency = lerpf(1200.0, 380.0, progress)
			value = sin(TAU * frequency * time)
		"magic", "frost":
			frequency = lerpf(280.0, 920.0, progress)
			value = sin(TAU * frequency * time) + 0.35 * sin(TAU * frequency * 2.01 * time)
		"chime":
			frequency = 780.0
			value = sin(TAU * frequency * time) + 0.55 * sin(TAU * frequency * 2.71 * time)
		"hammer":
			frequency = lerpf(180.0, 55.0, progress)
			value = sin(TAU * frequency * time) + 0.7 * sin(TAU * 43.0 * time)
		"charge":
			frequency = lerpf(90.0, 330.0, progress)
			value = sin(TAU * frequency * time)
		"defeat":
			frequency = lerpf(210.0, 52.0, progress)
			value = sin(TAU * frequency * time)
		_:
			value = sin(TAU * frequency * time)
	return value * envelope * 0.33
