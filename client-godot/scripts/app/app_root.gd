class_name AppRoot
extends Node

## Composition root for the offline Adventure client (Mission 7 skeleton).
## Wires RuntimePort -> AdventureController -> AdventurePresenter ->
## AppController -> screens. Owns no gameplay logic itself.
##
## How AdventureRuntimePort.request_submitted actually gets answered (i.e.
## how a Dictionary command reaches game-core and comes back as a
## Dictionary response) is intentionally NOT decided here -- that is a
## cross-language execution bridge question (embedded runtime? exported
## precompiled tables? something else?) that has no implementation
## anywhere in this repo yet and needs an explicit decision from the
## project owner. See docs/evidence/offline-foundation-progress.md
## Mission 7. AppRoot only requires something that can drive
## AdventureRuntimePort's existing submit()/accept_response() contract,
## which is exactly what every headless test in this suite already does.

const AppControllerScript = preload("res://scripts/app/app_controller.gd")
const AdventureControllerScript = preload("res://scripts/adventure/adventure_controller.gd")
const AdventurePresenterScript = preload("res://scripts/adventure/adventure_presenter.gd")
const AdventureRuntimePortScript = preload("res://scripts/adventure/adventure_runtime_port.gd")
const PreparePresenterScript = preload("res://scripts/presenters/prepare_presenter.gd")
const PrepareScreenScript = preload("res://scripts/screens/match/prepare_screen.gd")
const PlaceholderScreenScript = preload("res://scripts/screens/placeholder_screen.gd")

var app_controller
var adventure_controller
var adventure_presenter
var runtime_port
var prepare_presenter

func _init() -> void:
	app_controller = AppControllerScript.new()
	adventure_controller = AdventureControllerScript.new()
	adventure_presenter = AdventurePresenterScript.new()
	runtime_port = AdventureRuntimePortScript.new()
	prepare_presenter = PreparePresenterScript.new()
	add_child(app_controller)
	add_child(adventure_controller)
	add_child(adventure_presenter)

	var prepare_screen = PrepareScreenScript.new()
	prepare_presenter.attach_controller(adventure_controller)
	prepare_screen.attach_presenter(prepare_presenter)
	adventure_presenter.prepare_presented.connect(prepare_presenter.bind)

	var home_screen = PlaceholderScreenScript.new("home")
	var combat_screen = PlaceholderScreenScript.new("combat")
	var reward_screen = PlaceholderScreenScript.new("reward")
	var result_screen = PlaceholderScreenScript.new("result")
	var collection_screen = PlaceholderScreenScript.new("collection")
	var settings_screen = PlaceholderScreenScript.new("settings")
	adventure_presenter.combat_presented.connect(combat_screen.bind)
	adventure_presenter.reward_presented.connect(reward_screen.bind)
	adventure_presenter.complete_presented.connect(result_screen.bind)

	for screen in [home_screen, prepare_screen, combat_screen, reward_screen, result_screen, collection_screen, settings_screen]:
		add_child(screen)
	app_controller.register_screen("home", home_screen)
	app_controller.register_screen("prepare", prepare_screen)
	app_controller.register_screen("combat", combat_screen)
	app_controller.register_screen("reward", reward_screen)
	app_controller.register_screen("result", result_screen)
	app_controller.register_screen("collection", collection_screen)
	app_controller.register_screen("settings", settings_screen)
	app_controller.show_home()

	adventure_presenter.attach_controller(adventure_controller)
	app_controller.attach_presenter(adventure_presenter)
	adventure_controller.attach_runtime_port(runtime_port)
