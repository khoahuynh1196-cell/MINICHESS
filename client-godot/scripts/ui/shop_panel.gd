class_name ShopPanel
extends Panel

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")
const HeroCardScript = preload("res://scripts/ui/hero_card.gd")

const SHOP_SLOT_COUNT := 5
const BENCH_SLOT_COUNT := 8

signal buy_shop_slot(index: int)
signal refresh_shop
signal lock_shop

var _catalog: Dictionary = {}
var _slots: Array = []
var _odds: Dictionary = {}
var _locked := false
var _gold := 0
var _bench_count := 0
var _prepare_enabled := false
var _free_refreshes := 0

func _init() -> void:
	name = "ShopPanel"
	add_theme_stylebox_override("panel", ThemeTokensScript.panel_style(ThemeTokensScript.STONE))

func set_catalog(catalog: Dictionary) -> void:
	_catalog = catalog.duplicate(true)
	_rebuild()

func set_purchase_context(gold: int, bench_count: int, prepare_enabled: bool, free_refreshes: int) -> void:
	_gold = gold
	_bench_count = bench_count
	_prepare_enabled = prepare_enabled
	_free_refreshes = free_refreshes
	_rebuild()

func bind_shop(slots: Array, odds: Dictionary, locked: bool) -> void:
	_slots = slots.duplicate(true)
	_odds = odds.duplicate(true)
	_locked = locked
	_rebuild()

func _rebuild() -> void:
	for child in get_children():
		remove_child(child)
		child.free()
	_add_label("ShopHeading", "SHOP  •  five shared-pool offers", Rect2(20.0, 12.0, 530.0, 30.0), ThemeTokensScript.TYPE_META, ThemeTokensScript.PARCHMENT)
	for index in SHOP_SLOT_COUNT:
		var card = HeroCardScript.new()
		card.name = "BuySlot%d" % index
		card.position = Vector2(20.0 + index * 194.0, 48.0)
		card.size = Vector2(180.0, 138.0)
		var slot = _slots[index] if index < _slots.size() else {}
		card.configure(Dictionary(slot) if slot != null else {}, _catalog)
		var disabled_reason := _purchase_disabled_reason(slot)
		if not disabled_reason.is_empty():
			card.set_purchase_enabled(false, disabled_reason)
		elif not card.is_unique_offer:
			card.pressed.connect(func() -> void: buy_shop_slot.emit(index))
		add_child(card)
	_add_label("TierOdds", _odds_text(), Rect2(20.0, 198.0, 435.0, 30.0), 16, ThemeTokensScript.PARCHMENT)
	var refresh_cost := "Free refresh" if _free_refreshes > 0 else "Refresh • 2 Gold"
	var refresh := _button("RefreshShop", refresh_cost, Rect2(680.0, 192.0, 300.0, 44.0), ThemeTokensScript.PLAYER)
	refresh.disabled = not _prepare_enabled or _locked or (_free_refreshes <= 0 and _gold < 2)
	refresh.tooltip_text = "Shop is locked by the server. Unlock it before refreshing." if _locked else "Ask the server for five new shop offers."
	if not refresh.disabled:
		refresh.pressed.connect(func() -> void: refresh_shop.emit())
	var lock := _button("LockShop", "Unlock shop" if _locked else "Lock shop", Rect2(465.0, 192.0, 205.0, 44.0), ThemeTokensScript.GOLD)
	lock.disabled = not _prepare_enabled
	lock.tooltip_text = "Ask the server to unlock the current shop." if _locked else "Ask the server to preserve the current shop."
	if not lock.disabled:
		lock.pressed.connect(func() -> void: lock_shop.emit())

func _purchase_disabled_reason(slot) -> String:
	if slot == null or Dictionary(slot).is_empty():
		return "This offer has already been taken."
	if not _prepare_enabled:
		return "Shop purchases are available only during preparation."
	if _bench_count >= BENCH_SLOT_COUNT:
		return "Bench full: sell or deploy a hero before buying."
	if _gold < int(Dictionary(slot).get("cost", 0)):
		return "Not enough gold for this hero."
	return ""

func _odds_text() -> String:
	if _odds.is_empty():
		return "Tier odds: authoritative data unavailable"
	var segments: Array[String] = []
	for tier in range(1, 6):
		segments.append("T%d %d%%" % [tier, _tier_odd(tier)])
	return "  ".join(segments)

func _tier_odd(tier: int) -> int:
	if _odds.has("tier%d" % tier):
		return int(_odds["tier%d" % tier])
	if _odds.has(str(tier)):
		return int(_odds[str(tier)])
	return int(_odds.get(tier, 0))

func _add_label(node_name: String, label_text: String, rect: Rect2, font_size: int, color: Color) -> void:
	var label := Label.new()
	label.name = node_name
	label.text = label_text
	label.position = rect.position
	label.size = rect.size
	label.add_theme_font_size_override("font_size", font_size)
	label.add_theme_color_override("font_color", color)
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(label)

func _button(node_name: String, label_text: String, rect: Rect2, accent: Color) -> Button:
	var button := Button.new()
	button.name = node_name
	button.text = label_text
	button.position = rect.position
	button.size = rect.size
	button.focus_mode = Control.FOCUS_ALL
	ThemeTokensScript.apply_button_style(button, accent)
	add_child(button)
	return button
