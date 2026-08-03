class_name RunRecapScreen
extends VBoxContainer

var result_label: Label
var details_label: Label
var recap_snapshot: Dictionary = {}

func _init() -> void:
	name = "RunRecapScreen"
	add_theme_constant_override("separation", 16)
	result_label = Label.new()
	result_label.name = "RecapResult"
	result_label.add_theme_font_size_override("font_size", 30)
	result_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(result_label)
	details_label = Label.new()
	details_label.name = "RecapDetails"
	details_label.add_theme_font_size_override("font_size", 20)
	details_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	add_child(details_label)

func bind_snapshot(snapshot: Dictionary) -> void:
	# Recap is a read-only projection of an authoritative outcome. It deliberately
	# does not derive winner, MVP, totals, traits, or rewards from combat events.
	recap_snapshot = {
		"winner": snapshot.get("winner", ""),
		"round": snapshot.get("round", ""),
		"mvp": snapshot.get("mvp", ""),
		"damageByHero": snapshot.get("damageByHero", {}),
		"healByHero": snapshot.get("healByHero", {}),
		"activeTraits": snapshot.get("activeTraits", []),
	}
	var winner := str(recap_snapshot.get("winner", ""))
	var result := "Victory" if winner == "player" else "Defeat" if winner == "enemy" else "Combat complete"
	result_label.text = "%s — Round %s" % [result, str(recap_snapshot.get("round", ""))]
	details_label.text = "MVP: %s\nDamage: %s\nHealing: %s\nActive traits: %s" % [
		str(recap_snapshot.get("mvp", "")),
		str(recap_snapshot.get("damageByHero", {})),
		str(recap_snapshot.get("healByHero", {})),
		", ".join(PackedStringArray(recap_snapshot.get("activeTraits", []))),
	]
