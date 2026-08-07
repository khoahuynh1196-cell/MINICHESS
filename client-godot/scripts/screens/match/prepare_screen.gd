class_name MatchPrepareScreen
extends Control

## Minimal, correctness-first Prepare screen for the Mission 7 navigation
## skeleton: it renders the real 4x8/16-local-cell domain contract (board,
## bench, shop, actions) with plain Controls, and every button's
## enabled/disabled state and rejection reason comes from
## PreparePresenter.action()/shop_slot_action() -- never computed locally.
##
## This intentionally does not attempt the board art, drag-drop formation,
## or tabbed shop/item/trait layout the old scripts/ui/prepare_screen.gd
## has, because that script (and its 4x6=24-cell board assumption) predates
## the locked 4x8/16-cell production contract and needs its own dedicated
## rework -- see docs/evidence/offline-foundation-progress.md Mission 7.

const PreparePresenterScript = preload("res://scripts/presenters/prepare_presenter.gd")

var presenter
var _header: Label
var _board_grid: GridContainer
var _shop_row: HBoxContainer
var _start_round_button: Button

func _init() -> void:
	_build()

func attach_presenter(next_presenter) -> void:
	presenter = next_presenter
	presenter.updated.connect(_on_updated)

func _build() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	var root := VBoxContainer.new()
	root.name = "Root"
	root.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(root)

	_header = Label.new()
	_header.name = "Header"
	root.add_child(_header)

	var board_label := Label.new()
	board_label.text = "Board"
	root.add_child(board_label)
	_board_grid = GridContainer.new()
	_board_grid.name = "BoardGrid"
	_board_grid.columns = 4
	root.add_child(_board_grid)

	var shop_label := Label.new()
	shop_label.text = "Shop"
	root.add_child(shop_label)
	_shop_row = HBoxContainer.new()
	_shop_row.name = "ShopRow"
	root.add_child(_shop_row)

	_start_round_button = Button.new()
	_start_round_button.name = "StartRoundButton"
	_start_round_button.text = "Start Round"
	_start_round_button.pressed.connect(func() -> void: presenter.request_start_round())
	root.add_child(_start_round_button)

func _on_updated(view: Dictionary) -> void:
	_header.text = "%s | Round %d | Lv %d | Gold %d | HP %d" % [
		String(view.get("phase", "")), int(view.get("round", 0)), int(view.get("level", 0)),
		int(view.get("gold", 0)), int(view.get("health", 0)),
	]
	_rebuild_board(Array(view.get("board", [])))
	_rebuild_shop(Array(view.get("shop", [])))
	var start_action: Dictionary = presenter.action("startRound")
	_start_round_button.disabled = not bool(start_action.get("allowed", false))
	_start_round_button.tooltip_text = String(start_action.get("reason", ""))

func _rebuild_board(board: Array) -> void:
	for child in _board_grid.get_children():
		_board_grid.remove_child(child)
		child.queue_free()
	for index in range(board.size()):
		var hero_value = board[index]
		var button := Button.new()
		button.name = "BoardCell%d" % index
		button.custom_minimum_size = Vector2(64, 64)
		button.text = String(Dictionary(hero_value).get("heroId", "")) if typeof(hero_value) == TYPE_DICTIONARY else "-"
		button.disabled = true
		_board_grid.add_child(button)

func _rebuild_shop(shop: Array) -> void:
	for child in _shop_row.get_children():
		_shop_row.remove_child(child)
		child.queue_free()
	for index in range(shop.size()):
		var slot_value = shop[index]
		var slot_action: Dictionary = presenter.shop_slot_action(index)
		var button := Button.new()
		button.name = "ShopSlot%d" % index
		button.text = String(Dictionary(slot_value).get("heroId", "-")) if typeof(slot_value) == TYPE_DICTIONARY else "-"
		button.disabled = not bool(slot_action.get("allowed", false))
		button.tooltip_text = String(slot_action.get("reason", ""))
		button.pressed.connect(presenter.request_buy_shop_hero.bind(index))
		_shop_row.add_child(button)
