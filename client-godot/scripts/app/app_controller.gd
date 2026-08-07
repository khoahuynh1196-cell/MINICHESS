class_name AppController
extends Node

## Owns Adventure screen navigation ONLY: which scene is visible, driven by
## AdventurePresenter's phase signals. AppController never computes
## gameplay state, never decides whether an action is allowed, and never
## builds a network/localhost request — every value and every
## enabled/disabled decision comes from the attached presenter's typed
## model, which in turn comes from the domain view (game-core).

signal screen_changed(screen_id: String)

const SCREEN_IDS := ["home", "prepare", "combat", "reward", "result", "collection", "settings"]

var current_screen_id := ""
var _presenter
var _screens: Dictionary = {}

func register_screen(screen_id: String, screen: Node) -> void:
	_screens[screen_id] = screen
	if screen is CanvasItem:
		screen.visible = (screen_id == current_screen_id)

func screen_node(screen_id: String) -> Node:
	return _screens.get(screen_id)

func attach_presenter(presenter) -> void:
	if _presenter != null:
		_disconnect_presenter(_presenter)
	_presenter = presenter
	if _presenter == null:
		return
	_presenter.prepare_presented.connect(_on_prepare_presented)
	_presenter.combat_presented.connect(_on_combat_presented)
	_presenter.reward_presented.connect(_on_reward_presented)
	_presenter.complete_presented.connect(_on_complete_presented)

func show_home() -> void:
	_show_screen("home")

func show_collection() -> void:
	_show_screen("collection")

func show_settings() -> void:
	_show_screen("settings")

func _on_prepare_presented(_view: Dictionary) -> void:
	_show_screen("prepare")

func _on_combat_presented(_view: Dictionary) -> void:
	_show_screen("combat")

func _on_reward_presented(_view: Dictionary) -> void:
	_show_screen("reward")

func _on_complete_presented(_view: Dictionary) -> void:
	_show_screen("result")

func _show_screen(screen_id: String) -> void:
	current_screen_id = screen_id
	for id in _screens:
		var screen: Node = _screens[id]
		if screen is CanvasItem:
			screen.visible = (id == screen_id)
	screen_changed.emit(screen_id)

func _disconnect_presenter(presenter) -> void:
	if presenter.prepare_presented.is_connected(_on_prepare_presented):
		presenter.prepare_presented.disconnect(_on_prepare_presented)
	if presenter.combat_presented.is_connected(_on_combat_presented):
		presenter.combat_presented.disconnect(_on_combat_presented)
	if presenter.reward_presented.is_connected(_on_reward_presented):
		presenter.reward_presented.disconnect(_on_reward_presented)
	if presenter.complete_presented.is_connected(_on_complete_presented):
		presenter.complete_presented.disconnect(_on_complete_presented)
