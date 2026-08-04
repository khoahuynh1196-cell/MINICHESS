class_name FeedbackOverlay
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

var _loading_panel: PanelContainer
var _spinner: Label
var _error_banner: PanelContainer
var _error_message: Label
var _retry_button: Button
var _retry_action: Callable

func _init() -> void:
	name = "FeedbackOverlay"
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_PASS
	_build()
	clear_feedback()

func show_loading(message: String) -> void:
	_spinner.text = "⟳ Loading: %s" % message
	_spinner.tooltip_text = "Loading. %s" % message
	_spinner.visible = true
	_loading_panel.visible = true
	_error_banner.visible = false

func show_error(message: String, retry_action: Callable) -> void:
	_error_message.text = message
	_error_message.tooltip_text = "Request error: %s" % message
	_retry_action = retry_action
	_retry_button.disabled = not _retry_action.is_valid()
	_error_banner.visible = true
	_loading_panel.visible = false

func clear_feedback() -> void:
	_spinner.visible = false
	_loading_panel.visible = false
	_error_banner.visible = false
	_retry_action = Callable()

func _build() -> void:
	_loading_panel = PanelContainer.new()
	_loading_panel.name = "LoadingPanel"
	_loading_panel.position = Vector2(40.0, 140.0)
	_loading_panel.size = Vector2(1000.0, 72.0)
	_loading_panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.STONE_RAISED))
	_loading_panel.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(_loading_panel)
	_spinner = Label.new()
	_spinner.name = "LoadingSpinner"
	_spinner.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	_spinner.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	_spinner.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	_spinner.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	_loading_panel.add_child(_spinner)

	_error_banner = PanelContainer.new()
	_error_banner.name = "ErrorBanner"
	_error_banner.position = Vector2(40.0, 140.0)
	_error_banner.size = Vector2(1000.0, 132.0)
	_error_banner.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.DANGER))
	add_child(_error_banner)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	_error_banner.add_child(content)
	_error_message = Label.new()
	_error_message.name = "ErrorMessage"
	_error_message.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	_error_message.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	_error_message.add_theme_color_override("font_color", ThemeTokensScript.INK)
	content.add_child(_error_message)
	_retry_button = Button.new()
	_retry_button.name = "RetryButton"
	_retry_button.text = "Retry"
	_retry_button.tooltip_text = "Retry the failed request"
	_retry_button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(_retry_button, ThemeTokensScript.PARCHMENT)
	_retry_button.pressed.connect(_retry)
	content.add_child(_retry_button)

func _retry() -> void:
	if _retry_action.is_valid():
		_retry_action.call()
