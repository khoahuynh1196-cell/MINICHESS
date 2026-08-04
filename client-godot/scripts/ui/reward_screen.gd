class_name RewardScreen
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const ItemMetadataCatalogScript = preload("res://scripts/ui/item_metadata_catalog.gd")
const HeroVisualCatalogScript = preload("res://scripts/presentation/hero_visual_catalog.gd")

signal select_reward(offer_id: String, option_id: String)
signal ack_unique(reveal_id: String)
signal claim_empty_reward

var _plan: Dictionary = {}
var _revealed_items: Array = []
var _selected_by_offer: Dictionary = {}
var _acknowledged_reveals: Dictionary = {}
var _reduced_motion := false
var _reveal_tweens: Array[Tween] = []

func _init() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_STOP

func bind_reward(plan: Dictionary, items: Array, reduced_motion: bool) -> void:
	_cancel_reveal_tweens()
	_plan = plan.duplicate(true)
	_revealed_items = items.duplicate(true)
	_reduced_motion = reduced_motion
	_selected_by_offer.clear()
	_acknowledged_reveals.clear()
	_rebuild()

func offered_option_ids() -> Array[String]:
	var ids: Array[String] = []
	for offer in Array(_plan.get("offers", [])):
		for option in Array(Dictionary(offer).get("options", [])):
			ids.append(String(Dictionary(option).get("id", "")))
	return ids

func get_selectable_option_count() -> int:
	return offered_option_ids().size()

func is_selection_complete() -> bool:
	var offers: Array = Array(_plan.get("offers", []))
	if offers.is_empty():
		return true
	for offer in offers:
		if not _selected_by_offer.has(String(Dictionary(offer).get("id", ""))):
			return false
	return true

func choose_server_option(offer_id: String, option_id: String) -> void:
	for offer in Array(_plan.get("offers", [])):
		var offer_data := Dictionary(offer)
		if String(offer_data.get("id", "")) != offer_id:
			continue
		if not Array(offer_data.get("options", [])).any(func(option): return String(Dictionary(option).get("id", "")) == option_id):
			return
		_selected_by_offer[offer_id] = option_id
		select_reward.emit(offer_id, option_id)
		_rebuild()
		return

func unique_reveal_ids() -> Array[String]:
	var ids: Array[String] = []
	if int(_plan.get("round", 0)) != 4:
		return ids
	for item in _revealed_items:
		var item_data := Dictionary(item)
		if String(item_data.get("kind", "")) == "unique" and not item_data.has("equippedHeroInstanceId"):
			ids.append(String(item_data.get("instanceId", "")))
	return ids

func acknowledge_unique(reveal_id: String) -> void:
	if not reveal_id in unique_reveal_ids() or _acknowledged_reveals.has(reveal_id):
		return
	_acknowledged_reveals[reveal_id] = true
	ack_unique.emit(reveal_id)
	_rebuild()

func reveal_animation_duration() -> float:
	return ThemeTokensScript.motion_duration(0.35, _reduced_motion)

func _rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.queue_free()
	var background := ColorRect.new()
	background.color = ThemeTokensScript.NAVY
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var panel := VBoxContainer.new()
	panel.position = Vector2(40.0, 165.0)
	panel.size = Vector2(1000.0, 1550.0)
	panel.add_theme_constant_override("separation", ThemeTokensScript.TOUCH_GAP)
	add_child(panel)
	var heading := Label.new()
	heading.text = "Round %d rewards" % int(_plan.get("round", 0))
	heading.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_TITLE)
	heading.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	panel.add_child(heading)
	var instruction := Label.new()
	instruction.text = "Choose one card in every offered reward. Choices are confirmed by the server."
	instruction.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	instruction.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	instruction.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	panel.add_child(instruction)
	for reveal_id in unique_reveal_ids():
		var item = _revealed_items.filter(func(candidate): return String(Dictionary(candidate).get("instanceId", "")) == reveal_id).front()
		var item_data := Dictionary(item)
		var metadata := ItemMetadataCatalogScript.item_metadata(String(item_data.get("itemId", "")))
		var reveal_panel := PanelContainer.new()
		reveal_panel.name = "UniqueRevealPanel"
		reveal_panel.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.GOLD))
		var reveal := _button("Unique revealed: %s%s" % [String(metadata.get("name", "Unknown unique item")), " (acknowledged)" if _acknowledged_reveals.has(reveal_id) else ""], ThemeTokensScript.GOLD)
		reveal.name = "UniqueReveal_%s" % reveal_id
		reveal.disabled = _acknowledged_reveals.has(reveal_id)
		reveal.tooltip_text = "Acknowledge the server-owned Unique item reveal"
		reveal.pressed.connect(acknowledge_unique.bind(reveal_id))
		reveal_panel.add_child(reveal)
		panel.add_child(reveal_panel)
		_animate_reveal(reveal_panel)
	var offers: Array = Array(_plan.get("offers", []))
	if offers.is_empty():
		instruction.text = "This round has an automatic server reward. Collect it to continue your expedition."
		var bonus := Label.new()
		bonus.text = _empty_reward_summary()
		bonus.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
		bonus.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
		bonus.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		panel.add_child(bonus)
		var continue_button := _button(_empty_reward_button_label(), ThemeTokensScript.GOLD)
		continue_button.name = "ClaimEmptyReward"
		continue_button.tooltip_text = "Collect this server-owned round reward and continue the expedition."
		continue_button.pressed.connect(func() -> void: claim_empty_reward.emit())
		panel.add_child(continue_button)
	for offer in offers:
		var offer_data := Dictionary(offer)
		var offer_id := String(offer_data.get("id", ""))
		var label := Label.new()
		label.text = "%s — choose one" % String(offer_data.get("kind", "reward")).replace("_", " ").capitalize()
		label.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
		label.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		panel.add_child(label)
		for option in Array(offer_data.get("options", [])):
			var option_data := Dictionary(option)
			var option_id := String(option_data.get("id", ""))
			var selected := String(_selected_by_offer.get(offer_id, "")) == option_id
			var option_button := _button("%s%s" % [_option_label(option_data), "  ✓ selected" if selected else ""], ThemeTokensScript.PLAYER if selected else ThemeTokensScript.STONE_RAISED)
			option_button.name = "RewardOption_%s" % option_id
			option_button.tooltip_text = "%s. Choose this reward." % _option_label(option_data)
			option_button.pressed.connect(choose_server_option.bind(offer_id, option_id))
			panel.add_child(option_button)
	var completion := Label.new()
	completion.text = "All selections sent for authoritative claim." if is_selection_complete() else "Select an option from every offer to continue."
	completion.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_BODY)
	completion.add_theme_color_override("font_color", ThemeTokensScript.SUCCESS if is_selection_complete() else ThemeTokensScript.MUTED)
	panel.add_child(completion)

func _option_label(option: Dictionary) -> String:
	var option_id := String(option.get("id", ""))
	if String(option.get("kind", "")) == "hero":
		var profile := HeroVisualCatalogScript.profile(option_id)
		return "%s (hero)" % String(profile.get("display_name", "Unknown hero"))
	var metadata := ItemMetadataCatalogScript.item_metadata(option_id)
	return String(metadata.get("name", "Unknown reward"))

func _empty_reward_summary() -> String:
	var parts: Array[String] = []
	var gold := int(_plan.get("supplementalGold", 0))
	var refreshes := int(_plan.get("freeRefreshes", 0))
	if gold > 0:
		parts.append("%d bonus Gold" % gold)
	if refreshes > 0:
		parts.append("%d free shop refresh%s" % [refreshes, "" if refreshes == 1 else "es"])
	return "Server reward ready: %s." % (", ".join(parts) if not parts.is_empty() else "continue your expedition")

func _empty_reward_button_label() -> String:
	var gold := int(_plan.get("supplementalGold", 0))
	return "Collect %d Gold & continue" % gold if gold > 0 else "Collect reward & continue"

func _animate_reveal(reveal_panel: Control) -> void:
	if _reduced_motion or not is_inside_tree():
		reveal_panel.modulate.a = 1.0
		return
	reveal_panel.modulate.a = 0.0
	var tween := create_tween()
	tween.set_trans(Tween.TRANS_SINE)
	tween.set_ease(Tween.EASE_OUT)
	tween.tween_property(reveal_panel, "modulate:a", 1.0, reveal_animation_duration())
	tween.finished.connect(func() -> void: _reveal_tweens.erase(tween))
	_reveal_tweens.append(tween)

func _cancel_reveal_tweens() -> void:
	for tween in _reveal_tweens:
		if is_instance_valid(tween):
			tween.kill()
	_reveal_tweens.clear()

func _button(label: String, accent: Color) -> Button:
	var button := Button.new()
	button.text = label
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	if accent == ThemeTokensScript.STONE_RAISED:
		button.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
		button.add_theme_color_override("font_hover_color", ThemeTokensScript.PARCHMENT)
		button.add_theme_color_override("font_pressed_color", ThemeTokensScript.PARCHMENT)
	return button
