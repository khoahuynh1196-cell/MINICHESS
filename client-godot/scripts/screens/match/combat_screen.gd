class_name MatchCombatScreen
extends Control

## Minimal, correctness-first Combat screen: renders live domain state while
## the domain resolves combat (phase COMBAT), then drives a CombatPresenter
## from the recorded playback once it arrives (phase PLAYBACK), and
## automatically ACKs once the presentation reaches its end. No board art,
## camera work, or VFX yet -- see Mission 8 evidence for what remains.

const CombatPresenterScript = preload("res://scripts/presenters/combat_presenter.gd")

var combat_presenter
var adventure_controller
var _header: Label
var _unit_list: VBoxContainer
var _phase := ""
var _acked_for_combat_id := ""
var _current_combat_id := ""

func _init() -> void:
	combat_presenter = CombatPresenterScript.new()
	combat_presenter.combat_finished.connect(_on_combat_finished)
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root := VBoxContainer.new()
	root.name = "Root"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)
	_header = Label.new()
	_header.name = "Header"
	root.add_child(_header)
	_unit_list = VBoxContainer.new()
	_unit_list.name = "UnitList"
	root.add_child(_unit_list)

func attach_controller(controller) -> void:
	adventure_controller = controller

func on_playback_ready(playback: Dictionary) -> void:
	_current_combat_id = String(playback.get("combatId", ""))
	combat_presenter.load_playback(playback)

func bind(view: Dictionary) -> void:
	_phase = String(view.get("phase", ""))
	_header.text = "Combat | phase=%s round=%s" % [_phase, view.get("round", "-")]
	if _phase != "PLAYBACK":
		_render_units()

func _process(delta: float) -> void:
	if _phase != "PLAYBACK" or combat_presenter.timeline == null:
		return
	combat_presenter.process(delta)
	_render_units()

func _on_combat_finished() -> void:
	# Guard against acking the same combat twice if _process still fires a
	# frame after the domain has already moved on (e.g. while the REWARD
	# view is being applied).
	if adventure_controller == null or _acked_for_combat_id == _current_combat_id:
		return
	_acked_for_combat_id = _current_combat_id
	adventure_controller.request_ack_playback_complete()

func _render_units() -> void:
	for child in _unit_list.get_children():
		_unit_list.remove_child(child)
		child.queue_free()
	for unit_id in combat_presenter.actor_ids():
		var current = combat_presenter.actor(unit_id)
		var label := Label.new()
		var tick: int = combat_presenter.timeline.elapsed_ticks() if combat_presenter.timeline != null else 0
		label.text = "%s [%s] hp=%d/%d state=%s" % [unit_id, current.side, current.hp, current.max_hp, current.state_at(tick)]
		_unit_list.add_child(label)
