extends SceneTree

const OUTPUT_PATH := "res://../tmp/adventure-combat-frame-1080x1920.png"
const METADATA_PATH := "res://../tmp/adventure-combat-frame-1080x1920.json"
const CANONICAL_RULESET_VERSION := "production-4x6-0.1.0"
const CANONICAL_CONTENT_VERSION := "alpha-0.4.0"
const CANONICAL_ASSET_VERSION := "asset-4x6-0.1.0"

func _init() -> void:
	call_deferred("_capture")

func _capture() -> void:
	root.size = Vector2i(1080, 1920)
	var main_scene = load("res://scenes/main.tscn").instantiate()
	root.add_child(main_scene)
	# Let the mobile UI build and then advance to the authored cast cue while
	# keeping the representative frame paused for deterministic inspection.
	await process_frame
	main_scene._paused = true
	main_scene.advance_replay(0.15)
	main_scene.show_mobile_screen("combat")
	main_scene.feedback_overlay.clear_feedback()
	await process_frame
	RenderingServer.force_draw()
	var image := root.get_texture().get_image()
	var output_file := ProjectSettings.globalize_path(OUTPUT_PATH)
	var error := ERR_UNAVAILABLE if image == null else image.save_png(output_file)
	var metadata := {
		"ruleset_version": CANONICAL_RULESET_VERSION,
		"content_version": CANONICAL_CONTENT_VERSION,
		"asset_manifest_version": CANONICAL_ASSET_VERSION,
		"viewport": { "width": 1080, "height": 1920 },
		"board_rect": { "x": 132.0, "y": 176.0, "width": 816.0, "height": 652.0 },
		"footer_safe_y": 828.0,
		"units": main_scene.unit_views.size(),
		"save_error": error,
		"generated_at_utc": Time.get_datetime_string_from_system(true, true),
	}
	var metadata_file := FileAccess.open(ProjectSettings.globalize_path(METADATA_PATH), FileAccess.WRITE)
	if metadata_file != null:
		metadata_file.store_string(JSON.stringify(metadata, "  "))
		metadata_file.close()
	print("ADVENTURE_FRAME path=%s metadata=%s size=%s save_error=%s units=%d" % [output_file, ProjectSettings.globalize_path(METADATA_PATH), image.get_size() if image != null else Vector2i.ZERO, error, main_scene.unit_views.size()])
	main_scene.queue_free()
	quit(1 if error != OK or image == null or image.get_size() != Vector2i(1080, 1920) else 0)
