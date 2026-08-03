extends SceneTree

const CombatEventScript = preload("res://scripts/combat_event.gd")
const CombatHudScript = preload("res://scripts/ui/combat_hud.gd")
const RunRecapScreenScript = preload("res://scripts/ui/run_recap_screen.gd")
const BattleControllerScript = preload("res://scripts/battle_controller.gd")

var _failed := false

func _init() -> void:
	var hud = CombatHudScript.new()
	var requests := { "pause": false, "speed": 0.0 }
	hud.pause_requested.connect(func() -> void: requests["pause"] = true)
	hud.speed_requested.connect(func(speed: float) -> void: requests["speed"] = speed)
	hud.bind_snapshot({ "paused": false, "playbackSpeed": 1.0 })
	_expect(hud.pause_button.text == "Pause", "HUD must expose a pause control for an unpaused replay")
	hud.pause_button.emit_signal("pressed")
	hud.speed_2x_button.emit_signal("pressed")
	_expect(bool(requests.pause) and is_equal_approx(float(requests.speed), 2.0), "pause and 2x buttons must request presentation-only replay changes")
	hud.bind_snapshot({ "paused": true, "playbackSpeed": 2.0 })
	_expect(hud.pause_button.text == "Play" and hud.speed_label.text == "2x", "HUD must reflect authoritative presentation snapshot controls")
	var damage_event = CombatEventScript.from_dictionary({ "sequence": 1, "tick": 1, "type": "DAMAGE_APPLIED", "target_unit_id": "hero", "payload": { "amount": 42 } })
	hud.present_event(damage_event)
	_expect(hud.event_label.text.contains("Damage") and hud.event_label.tooltip_text == hud.event_label.text, "combat events must have a readable accessible announcement")
	hud.free()

	var recap = RunRecapScreenScript.new()
	recap.bind_snapshot({ "winner": "player", "round": 8, "mvp": "H04", "damageByHero": { "H04": 123 }, "healByHero": { "H05": 70 }, "activeTraits": ["Mage 2"] })
	_expect(recap.result_label.text.contains("Victory") and recap.result_label.text.contains("Round 8") and recap.details_label.text.contains("H04"), "recap must render server-published victory data")
	recap.bind_snapshot({ "winner": "enemy", "round": 3, "mvp": "PVE_03", "damageByHero": {}, "healByHero": {}, "activeTraits": [] })
	_expect(recap.result_label.text.contains("Defeat"), "recap must render server-published defeat copy")
	recap.free()

	var controller = BattleControllerScript.new()
	controller._create_mobile_ui()
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 2, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "player:H01:focus", "payload": { "side": "player", "position": 18, "max_hp": 100 } }))
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 3, "tick": 0, "type": "UNIT_SPAWNED", "source_unit_id": "enemy:PVE_08:focus", "payload": { "side": "enemy", "position": 3, "max_hp": 100 } }))
	var boss = controller.unit_views["enemy:PVE_08:focus"]
	_expect(controller.get_node_or_null("CombatCamera") != null and controller.camera_focus_position == boss.position, "boss arrival must use a presentation-only camera emphasis")
	var hp_before_cast: int = int(controller.unit_views["player:H01:focus"].hp)
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 4, "tick": 1, "type": "CAST_STARTED", "source_unit_id": "player:H01:focus", "target_unit_id": "enemy:PVE_08:focus", "payload": {} }))
	_expect(controller.camera_focus_position == controller.unit_views["player:H01:focus"].position and controller.unit_views["player:H01:focus"].hp == hp_before_cast, "cast camera emphasis must not mutate authoritative simulation state")
	controller.apply_event(CombatEventScript.from_dictionary({ "sequence": 5, "tick": 2, "type": "DAMAGE_APPLIED", "source_unit_id": "enemy:PVE_08:focus", "target_unit_id": "player:H01:focus", "payload": { "amount": 10, "remaining_hp": 90 } }))
	var vfx_pool = controller.get_node_or_null("CombatVfxPool")
	_expect(vfx_pool != null and vfx_pool.last_route == "damage", "controller must forward damage events to the pooled presentation VFX")
	controller.free()
	if _failed:
		quit(1)
		return
	print("PASS combat_hud_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if condition:
		return
	_failed = true
	push_error(message)
