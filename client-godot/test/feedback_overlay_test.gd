extends SceneTree

const FeedbackOverlayScript = preload("res://scripts/ui/feedback_overlay.gd")

var _failed := false
var _retried := false

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var overlay = FeedbackOverlayScript.new()
	root.add_child(overlay)
	overlay.show_loading("Creating expedition")
	var spinner: Label = overlay.find_child("LoadingSpinner", true, false) as Label
	_expect(spinner != null and spinner.visible and spinner.text.contains("Creating expedition"), "loading state must render a labelled spinner")
	_expect(spinner.tooltip_text.contains("Loading"), "loading state must expose an accessible description")
	overlay.show_error("Network unavailable", func() -> void: _retried = true)
	var banner: Control = overlay.find_child("ErrorBanner", true, false) as Control
	var retry: Button = overlay.find_child("RetryButton", true, false) as Button
	_expect(banner != null and banner.visible and retry != null and not retry.disabled, "request failures must render a visible recoverable error banner")
	_expect(retry.tooltip_text.contains("Retry"), "the recovery action must expose an accessible description")
	retry.pressed.emit()
	_expect(_retried, "the error banner retry action must invoke the supplied recovery")
	overlay.clear_feedback()
	_expect(not spinner.visible and not banner.visible, "successful recovery must clear transient feedback")
	overlay.free()
	if _failed:
		quit(1)
		return
	print("PASS feedback_overlay_test")
	quit(0)

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)
