extends SceneTree

const LocalRunStoreScript = preload("res://scripts/local_run_store.gd")
const BattleControllerScript = preload("res://scripts/battle_controller.gd")
const RunApiClientScript = preload("res://scripts/run_api_client.gd")
const SAVE_PATH := "user://local_pve_run.json"

var _failed := false

func _init() -> void:
	var store = LocalRunStoreScript.new()
	store.clear_run()

	var view := {
		"id": "run-local-alpha",
		"state": "PREPARE",
		"round": 3,
		"revision": 7,
		"gold": 11,
		"health": 26,
		"shop": [{ "heroId": "H01", "cost": 1 }],
		"bench": [{ "instanceId": "hero-local-1", "heroId": "H20", "cost": 5, "stars": 1 }],
		"board": [null, { "instanceId": "hero-local-2", "heroId": "H02", "cost": 2, "stars": 1 }],
	}
	store.save_run(view)
	_expect(store.load_run() == view, "saved public run views must round-trip without local mutation")

	_write_raw_json({ "schema_version": 999, "view": view })
	_expect(store.load_run().is_empty(), "a newer or incompatible save schema must not be resumed")
	_write_raw_json({ "schema_version": "1", "view": view })
	_expect(store.load_run().is_empty(), "a schema version with the wrong type must not be resumed")
	var stale_hero_choice := view.duplicate(true)
	stale_hero_choice["roundRewardPlan"] = { "offers": [{ "id": "reward:3:hero_choice:0", "kind": "hero_choice", "options": [{ "id": "H21", "kind": "hero" }] }] }
	_write_raw_json({ "schema_version": 1, "view": stale_hero_choice })
	_expect(store.load_run().is_empty(), "a cached hero-choice option outside H01-H20 must not be resumed")
	var non_hero_choice := view.duplicate(true)
	non_hero_choice["roundRewardPlan"] = { "offers": [{ "id": "reward:3:normal_item_choice:0", "kind": "normal_item_choice", "options": [{ "id": "I99", "kind": "normal_item" }] }] }
	_write_raw_json({ "schema_version": 1, "view": non_hero_choice })
	_expect(store.load_run() == non_hero_choice, "non-hero reward option IDs must remain valid cache data")

	_write_raw_text("{not valid json")
	_expect(store.load_run().is_empty(), "corrupt local JSON must be rejected instead of becoming a run view")

	store.save_run(view)
	store.clear_run()
	_expect(store.load_run().is_empty() and not FileAccess.file_exists(SAVE_PATH), "reset must remove the cached local run")

	store.save_run(view)
	var resume_controller = BattleControllerScript.new()
	resume_controller._create_mobile_ui()
	var resume_api = RunApiClientScript.new()
	var resume_failures: Array[String] = []
	resume_api.request_failed.connect(func(message: String) -> void: resume_failures.append(message))
	resume_controller.attach_run_api(resume_api)
	resume_controller._resume_local_run()
	var cached_retry: Button = resume_controller.find_child("RetryButton", true, false) as Button
	_expect(resume_controller.run_state.run_id.is_empty() and cached_retry != null and cached_retry.visible and not cached_retry.disabled, "a failed cached resume must expose an enabled retry action without becoming locally actionable")
	if cached_retry != null:
		cached_retry.pressed.emit()
	_expect(resume_failures.size() == 2, "cached-resume Retry must route through a second real resume request")
	resume_controller.free()
	store.clear_run()

	var controller = BattleControllerScript.new()
	controller.apply_run_view(view)
	_expect(store.load_run() == view, "accepted public server views must be cached for local resume")
	controller.apply_run_view({ "id": "run-local-alpha", "state": "COMPLETE" })
	_expect(store.load_run().is_empty(), "the terminal recap view must clear the resumable cache")
	controller.apply_run_view(view)
	controller.request_new_run("run-local-new")
	_expect(store.load_run().is_empty(), "starting a reset run must clear the prior resumable cache")
	controller.free()
	_finish()

func _write_raw_json(value: Dictionary) -> void:
	_write_raw_text(JSON.stringify(value))

func _write_raw_text(contents: String) -> void:
	var file := FileAccess.open(SAVE_PATH, FileAccess.WRITE)
	file.store_string(contents)
	file.close()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS local_run_store_test")
	quit(0)
