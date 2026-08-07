class_name AdventurePresenter
extends Node

## Routes AdventureController view updates to one signal per player-facing
## phase, so screens/scenes only ever need to listen for the phase they
## present instead of branching on view["phase"] themselves. This is the
## presentation-routing half of the Mission 7 architecture; AppController
## owns navigation (which scene is visible), this owns "what does the
## current Adventure view mean for presentation."

const ViewModelScript = preload("res://scripts/adventure/adventure_view_model.gd")
const RulesetCatalogScript = preload("res://scripts/rules/ruleset_catalog.gd")

signal prepare_presented(view: Dictionary)
signal combat_presented(view: Dictionary)
signal reward_presented(view: Dictionary)
signal complete_presented(view: Dictionary)
signal playback_ready(playback: Dictionary)
signal presentation_error(message: String)

var _controller
var _rules: Dictionary = {}
var _model

func _init() -> void:
	_rules = RulesetCatalogScript.load_ruleset()
	_model = ViewModelScript.new()

func attach_controller(controller) -> void:
	if _controller != null:
		_disconnect_controller(_controller)
	_controller = controller
	if _controller == null:
		return
	_controller.view_changed.connect(_on_view_changed)
	if _controller.has_signal("playback_ready"):
		_controller.playback_ready.connect(_on_playback_ready)
	if _controller.has_view():
		_on_view_changed(_controller.current_view())

func current_model() -> Dictionary:
	return _model.to_dictionary()

func _on_view_changed(view: Dictionary) -> void:
	if not _model.apply_view(view, _rules):
		presentation_error.emit("Adventure view is incompatible with the active ruleset")
		return
	match _model.phase:
		"PREPARE":
			prepare_presented.emit(_model.to_dictionary())
		"COMBAT", "PLAYBACK":
			# PLAYBACK reuses the combat screen: it is the same "watch the
			# fight" presentation, now driven by the authoritative recorded
			# event log (see playback_ready) instead of a live simulation.
			combat_presented.emit(_model.to_dictionary())
		"REWARD":
			reward_presented.emit(_model.to_dictionary())
		"COMPLETE":
			complete_presented.emit(_model.to_dictionary())

func _on_playback_ready(playback: Dictionary) -> void:
	playback_ready.emit(playback.duplicate(true))

func _disconnect_controller(controller) -> void:
	if controller.view_changed.is_connected(_on_view_changed):
		controller.view_changed.disconnect(_on_view_changed)
	if controller.has_signal("playback_ready") and controller.playback_ready.is_connected(_on_playback_ready):
		controller.playback_ready.disconnect(_on_playback_ready)
