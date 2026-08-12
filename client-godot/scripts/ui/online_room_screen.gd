class_name OnlineRoomScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
signal back_requested
signal queue_requested
signal poll_requested
signal ready_requested
signal reconnect_requested

var state := "OFFLINE"
var room: Dictionary = {}
var ticket_id := ""

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP
	_rebuild()

func set_state(next_state: String, next_room: Dictionary = {}, next_ticket_id: String = "") -> void:
	state = next_state
	room = next_room.duplicate(true)
	ticket_id = next_ticket_id
	_rebuild()

func _rebuild() -> void:
	for child in get_children():
		child.free()
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var title := Label.new()
	title.name = "OnlineTitle"
	title.text = "ONLINE PVP · 8 PLAYERS"
	title.position = Vector2(ThemeTokensScript.SCREEN_MARGIN, 82.0)
	title.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	title.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	add_child(title)
	var panel := PanelContainer.new()
	var rect := ThemeTokensScript.clamp_to_content_bounds(Rect2(40.0, 180.0, 1000.0, 760.0))
	panel.position = rect.position
	panel.size = rect.size
	panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style())
	add_child(panel)
	var content := VBoxContainer.new()
	content.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	panel.add_child(content)
	var status := Label.new()
	status.name = "OnlineStatus"
	status.text = "STATUS  %s" % state
	status.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	status.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	content.add_child(status)
	var detail := Label.new()
	detail.name = "OnlineDetail"
	detail.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	detail.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	detail.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	detail.text = _detail_text()
	content.add_child(detail)
	if state == "OFFLINE" or state == "AUTHENTICATED":
		content.add_child(_button("Find 8-player match", func() -> void: queue_requested.emit(), ThemeTokensScript.GOLD, "QueueOnline"))
	elif state == "QUEUED":
		content.add_child(_button("Check match", func() -> void: poll_requested.emit(), ThemeTokensScript.PLAYER, "PollOnline"))
	elif state == "MATCHED":
		content.add_child(_button("Ready", func() -> void: ready_requested.emit(), ThemeTokensScript.PLAYER, "ReadyOnline"))
		content.add_child(_button("Reconnect snapshot", func() -> void: reconnect_requested.emit(), ThemeTokensScript.STONE_RAISED, "ReconnectOnline"))
	else:
		content.add_child(_button("Reconnect snapshot", func() -> void: reconnect_requested.emit(), ThemeTokensScript.PLAYER, "ReconnectOnline"))
	var back := _button("Back to Lobby", func() -> void: back_requested.emit(), ThemeTokensScript.STONE_RAISED, "BackOnline")
	content.add_child(back)

func _detail_text() -> String:
	if state == "QUEUED":
		return "Searching SEA · Ranked\nTicket: %s\nServer-authoritative matchmaking is active." % ticket_id
	if room.is_empty():
		return "Guest identity and room transport are ready.\nCanonical: production-4x6-0.1.0 · alpha-0.4.0"
	var lease := Dictionary(room.get("lease", {}))
	return "Room %s\nSeats %d / %d · %s\nLease %s · Canonical 4×6" % [str(room.get("room_id", "")), Array(room.get("players", [])).size(), int(room.get("max_players", 8)), str(room.get("phase", "PREPARE")), str(lease.get("fencing_token", 0))]

func _button(label: String, action: Callable, accent: Color, node_name: String) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	button.pressed.connect(action)
	return button
