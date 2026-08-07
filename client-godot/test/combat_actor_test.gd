extends SceneTree

const CombatActorScript = preload("res://scripts/presentation/combat_actor.gd")

var _failed := false

func _init() -> void:
	_test_spawn_and_basic_attack_hit()
	_test_ranged_cast_window()
	_test_stun_outranks_hit()
	_test_heal_and_shield()
	_test_knockback_moves_the_target_not_the_source()
	_test_regular_move_pairing()
	_test_death_is_permanent_and_highest_priority()
	_test_state_is_tick_accurate_not_retroactive()
	_finish()

func _test_spawn_and_basic_attack_hit() -> void:
	var actor = CombatActorScript.new("p1")
	actor.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "p1", "side": "player", "hp": 90, "position": 16 } })
	_expect(actor.hp == 90 and actor.max_hp == 90 and actor.position == 16, "UNIT_SPAWNED must set hp/maxHp/position")
	_expect(actor.state_at(0) == "idle", "a freshly spawned unit must be idle")

	actor.apply_event({ "type": "ATTACK_STARTED", "tick": 10, "sourceUnitId": "p1", "targetUnitId": "e1", "releaseTick": 10, "impactTick": 12, "payload": {} })
	_expect(actor.state_at(10) == "attack" and actor.state_at(11) == "attack", "an attacker must be in the attack state during its release-to-impact window")
	_expect(actor.state_at(12) == "idle", "the attack window must end exactly at impactTick")

	actor.apply_event({ "type": "DAMAGE_APPLIED", "tick": 12, "targetUnitId": "p1", "payload": { "amount": 5, "remainingHp": 85 } })
	_expect(actor.hp == 85, "HP must update to the exact authoritative remainingHp on DAMAGE_APPLIED")
	_expect(actor.state_at(12) == "hit", "a unit that was just damaged must show a hit reaction")
	_expect(actor.state_at(12 + CombatActorScript.HIT_STATE_TICKS) == "idle", "the hit reaction must end after its fixed presentation window")

func _test_ranged_cast_window() -> void:
	var actor = CombatActorScript.new("caster")
	actor.apply_event({ "type": "CAST_STARTED", "tick": 5, "sourceUnitId": "caster", "targetUnitId": "target", "releaseTick": 5, "impactTick": 15, "payload": { "skillId": "S_H03" } })
	_expect(actor.state_at(5) == "cast" and actor.state_at(14) == "cast", "a caster must stay in the cast state through its release-to-impact window")
	_expect(actor.state_at(15) == "idle", "the cast window must end exactly at impactTick")

func _test_stun_outranks_hit() -> void:
	var actor = CombatActorScript.new("victim")
	actor.apply_event({ "type": "STATUS_APPLIED", "tick": 10, "targetUnitId": "victim", "payload": { "kind": "stun", "amount": 1000, "durationTicks": 20 } })
	actor.apply_event({ "type": "DAMAGE_APPLIED", "tick": 10, "targetUnitId": "victim", "payload": { "amount": 3, "remainingHp": 27 } })
	_expect(actor.state_at(10) == "hard_control", "hard control must outrank a simultaneous hit reaction")
	_expect(actor.state_at(29) == "hard_control" and actor.state_at(30) == "idle", "the stun window must last exactly durationTicks")

func _test_heal_and_shield() -> void:
	var actor = CombatActorScript.new("support-target")
	actor.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "support-target", "side": "player", "hp": 100, "position": 0 } })
	actor.apply_event({ "type": "DAMAGE_APPLIED", "tick": 5, "targetUnitId": "support-target", "payload": { "amount": 40, "remainingHp": 60 } })
	actor.apply_event({ "type": "HEAL_APPLIED", "tick": 20, "targetUnitId": "support-target", "payload": { "amount": 20, "remainingHp": 80 } })
	_expect(actor.hp == 80, "HP must update to the exact authoritative remainingHp on HEAL_APPLIED")
	actor.apply_event({ "type": "SHIELD_APPLIED", "tick": 21, "targetUnitId": "support-target", "payload": { "amount": 15 } })
	_expect(actor.hp == 80, "a shield must never change HP directly -- only DAMAGE_APPLIED/HEAL_APPLIED do")

func _test_knockback_moves_the_target_not_the_source() -> void:
	var pushed = CombatActorScript.new("pushed")
	pushed.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "pushed", "side": "enemy", "hp": 50, "position": 5 } })
	pushed.apply_event({ "type": "MOVE_STARTED", "tick": 8, "sourceUnitId": "caster", "targetUnitId": "pushed", "payload": { "from": 5, "to": 1, "kind": "knockback" } })
	_expect(pushed.position == 1, "a knockback must move its target (payload.targetUnitId), not its source, and update position from one event")
	_expect(pushed.state_at(8) == "move", "the knocked-back unit must show a move reaction")

	var caster = CombatActorScript.new("caster")
	caster.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "caster", "side": "player", "hp": 50, "position": 10 } })
	caster.apply_event({ "type": "MOVE_STARTED", "tick": 8, "sourceUnitId": "caster", "targetUnitId": "pushed", "payload": { "from": 5, "to": 1, "kind": "knockback" } })
	_expect(caster.position == 10, "the unit that caused a knockback must not have its own position changed by it")

func _test_regular_move_pairing() -> void:
	var actor = CombatActorScript.new("walker")
	actor.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "walker", "side": "player", "hp": 50, "position": 16 } })
	actor.apply_event({ "type": "MOVE_STARTED", "tick": 10, "sourceUnitId": "walker", "payload": { "from": 16, "to": 12 } })
	_expect(actor.position == 16, "regular pathing must not move the unit until MOVE_COMPLETED, unlike one-shot displacement")
	_expect(actor.state_at(15) == "move", "a unit mid-path must show the move state")
	actor.apply_event({ "type": "MOVE_COMPLETED", "tick": 20, "sourceUnitId": "walker", "payload": { "from": 16, "to": 12 } })
	_expect(actor.position == 12, "MOVE_COMPLETED must update position to its authoritative destination")
	_expect(actor.state_at(20) == "idle", "the move window must end exactly at MOVE_COMPLETED's tick")

func _test_death_is_permanent_and_highest_priority() -> void:
	var actor = CombatActorScript.new("doomed")
	actor.apply_event({ "type": "UNIT_SPAWNED", "tick": 0, "payload": { "unitId": "doomed", "side": "enemy", "hp": 10, "position": 3 } })
	actor.apply_event({ "type": "CAST_STARTED", "tick": 5, "sourceUnitId": "doomed", "releaseTick": 5, "impactTick": 50, "payload": {} })
	actor.apply_event({ "type": "DAMAGE_APPLIED", "tick": 10, "targetUnitId": "doomed", "payload": { "amount": 10, "remainingHp": 0 } })
	actor.apply_event({ "type": "UNIT_DIED", "tick": 10, "targetUnitId": "doomed", "payload": { "unitId": "doomed", "killerId": "someone" } })
	_expect(actor.hp == 0, "a dead unit's HP must be exactly 0")
	_expect(actor.state_at(10) == "dead", "death must outrank a still-open cast window at the same tick")
	_expect(actor.state_at(30) == "dead", "death must remain permanent even while an unrelated earlier window would still be open")
	_expect(actor.state_at(9) == "cast", "a unit must not appear dead before its own UNIT_DIED tick")

func _test_state_is_tick_accurate_not_retroactive() -> void:
	var actor = CombatActorScript.new("summon-x")
	actor.apply_event({ "type": "UNIT_SPAWNED", "tick": 30, "payload": { "unitId": "summon-x", "side": "player", "hp": 24, "position": 17 } })
	actor.apply_event({ "type": "UNIT_DIED", "tick": 110, "payload": { "unitId": "summon-x" } })
	_expect(actor.state_at(109) != "dead", "a unit must never appear dead before its own authoritative death tick, even on summon expiry (no killerId)")
	_expect(actor.state_at(110) == "dead", "a summon expiry (UNIT_DIED with no killerId) must still register as death")

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS combat_actor_test")
	quit(0)
