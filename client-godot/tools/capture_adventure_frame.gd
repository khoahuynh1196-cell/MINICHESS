extends SceneTree

const OUTPUT_PATH := "res://../tmp/adventure-combat-frame-1080x1920.png"

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
	var error := image.save_png(output_file)
	print("ADVENTURE_FRAME path=%s size=%s save_error=%s units=%d" % [output_file, image.get_size(), error, main_scene.unit_views.size()])
	main_scene.queue_free()
	quit(1 if error != OK or image.get_size() != Vector2i(1080, 1920) else 0)
