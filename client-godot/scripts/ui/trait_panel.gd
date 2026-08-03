class_name TraitPanel
extends Control

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const TraitSummaryScript = preload("res://scripts/ui/trait_summary.gd")

var _summaries: Array[Dictionary] = []

func bind_board_heroes(board_heroes: Array, catalog: Dictionary) -> void:
	_summaries = TraitSummaryScript.summarize(board_heroes, catalog)
	_rebuild()

func summaries() -> Array[Dictionary]:
	return _summaries.duplicate(true)

func _rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.STONE_RAISED))
	var heading := Label.new()
	heading.name = "TraitBottomSheetHeading"
	heading.text = "TRAIT CONSTELLATIONS"
	heading.position = Vector2(24.0, 18.0)
	heading.size = Vector2(540.0, 30.0)
	heading.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_SECTION)
	heading.add_theme_color_override("font_color", ThemeTokensScript.GOLD)
	heading.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(heading)
	var guidance := Label.new()
	guidance.name = "TraitBreakpointGuide"
	guidance.text = "Active thresholds: 2 / 4 / 6 deployed heroes"
	guidance.position = Vector2(24.0, 52.0)
	guidance.size = Vector2(680.0, 24.0)
	guidance.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_META)
	guidance.add_theme_color_override("font_color", ThemeTokensScript.MUTED)
	guidance.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(guidance)
	if _summaries.is_empty():
		_add_empty_copy()
		return
	for index in _summaries.size():
		_add_chip(_summaries[index], index)

func _add_empty_copy() -> void:
	var empty := Label.new()
	empty.name = "TraitEmpty"
	empty.text = "Deploy matching heroes to awaken a trait. Bench heroes do not count."
	empty.position = Vector2(24.0, 94.0)
	empty.size = Vector2(940.0, 44.0)
	empty.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	empty.add_theme_font_size_override("font_size", ThemeTokensScript.TYPE_META)
	empty.add_theme_color_override("font_color", ThemeTokensScript.PARCHMENT)
	empty.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(empty)

func _add_chip(summary: Dictionary, index: int) -> void:
	var column := index % 3
	var row := index / 3
	var chip := Panel.new()
	chip.name = "TraitChip%02d" % index
	chip.position = Vector2(24.0 + column * 318.0, 92.0 + row * 48.0)
	chip.size = Vector2(300.0, 44.0)
	var active := bool(summary.get("active", false))
	chip.add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.GOLD if active else ThemeTokensScript.STONE))
	chip.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(chip)
	var label := Label.new()
	label.name = "TraitChipLabel%02d" % index
	var active_breakpoint := int(summary.get("active_breakpoint", 0))
	var status := "ACTIVE %d" % active_breakpoint if active else "NEXT %d" % int(summary.get("target", 2))
	label.text = "%s  %d / 6  %s" % [String(summary.get("name", "Trait")), int(summary.get("count", 0)), status]
	label.position = Vector2(10.0, 8.0)
	label.size = Vector2(280.0, 28.0)
	label.add_theme_font_size_override("font_size", 18)
	label.add_theme_color_override("font_color", ThemeTokensScript.INK if active else ThemeTokensScript.PARCHMENT)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	chip.add_child(label)
