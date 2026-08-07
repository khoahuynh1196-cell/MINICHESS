extends SceneTree

const CombatPresenterScript = preload("res://scripts/presenters/combat_presenter.gd")

var _failed := false

func _init() -> void:
	var presenter = CombatPresenterScript.new()
	get_root().add_child(presenter)
	var changes: Array = []
	var finished_flag := [false] # a mutable container -- GDScript closures cannot reassign a captured bool
	presenter.actor_changed.connect(func(unit_id: String, snapshot: Dictionary) -> void: changes.append([unit_id, snapshot]))
	presenter.combat_finished.connect(func() -> void: finished_flag[0] = true)

	presenter.load_playback({
		"combatId": "combat:presenter-fixture:1:0",
		"tickRate": 20,
		"maxTicks": 40,
		"events": [
			{ "sequence": 0, "tick": 0, "type": "COMBAT_STARTED", "payload": {} },
			{ "sequence": 1, "tick": 0, "type": "UNIT_SPAWNED", "payload": { "unitId": "p1", "side": "player", "hp": 30, "position": 16 } },
			{ "sequence": 2, "tick": 0, "type": "UNIT_SPAWNED", "payload": { "unitId": "e1", "side": "enemy", "hp": 20, "position": 0 } },
			{ "sequence": 3, "tick": 10, "type": "ATTACK_STARTED", "sourceUnitId": "p1", "targetUnitId": "e1", "releaseTick": 10, "impactTick": 10, "payload": { "isCrit": false } },
			{ "sequence": 4, "tick": 10, "type": "DAMAGE_APPLIED", "sourceUnitId": "p1", "targetUnitId": "e1", "payload": { "amount": 20, "remainingHp": 0 } },
			{ "sequence": 5, "tick": 10, "type": "UNIT_DIED", "targetUnitId": "e1", "payload": { "unitId": "e1", "killerId": "p1" } },
			{ "sequence": 6, "tick": 10, "type": "COMBAT_ENDED", "payload": { "winner": "player" } },
		],
	})

	# Drive the whole fixture in one large step; every event must still
	# apply in order since CombatTimeline only paces wall-clock time, never
	# the event sequence itself.
	presenter.process(1.0)

	_expect(presenter.actor("e1").is_dead_at(10), "the presenter must apply UNIT_DIED to the correct actor")
	_expect(presenter.actor("e1").hp == 0, "the dead unit's HP must reflect its final DAMAGE_APPLIED event")
	_expect(presenter.actor("p1").hp == 30, "an untouched unit's HP must remain at its spawn value")
	_expect(finished_flag[0], "combat_finished must fire once COMBAT_ENDED is reached")

	var e1_updates := changes.filter(func(entry): return entry[0] == "e1")
	_expect(e1_updates.size() >= 3, "every event touching a unit must produce an actor_changed update (spawn, damage, death)")
	var last_e1_snapshot: Dictionary = e1_updates.back()[1]
	_expect(last_e1_snapshot["state"] == "dead" and last_e1_snapshot["hp"] == 0, "the final snapshot for a dead unit must show state=dead and hp=0")

	presenter.queue_free()
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS combat_presenter_test")
	quit(0)
