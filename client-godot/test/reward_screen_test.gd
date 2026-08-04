extends SceneTree

const ThemeTokensScript = preload("res://scripts/ui/theme_tokens.gd")

# A reward UI must be a projection of the immutable server offer.  Removing an
# offered option or adding a locally invented one must make this test fail.
var _failed := false

func _init() -> void:
	call_deferred("_run")

func _run() -> void:
	var reward_screen_script = load("res://scripts/ui/reward_screen.gd")
	_expect(reward_screen_script != null, "RewardScreen must exist to render authoritative offers")
	if reward_screen_script == null:
		_finish()
		return
	var screen = reward_screen_script.new()
	root.add_child(screen)
	var selected: Array = []
	var acknowledged: Array = []
	screen.select_reward.connect(func(offer_id: String, option_id: String) -> void: selected.append([offer_id, option_id]))
	screen.ack_unique.connect(func(reveal_id: String) -> void: acknowledged.append(reveal_id))
	screen.bind_reward({
		"round": 4,
		"offers": [{
			"id": "reward:4:hero_choice:1", "kind": "hero_choice",
			"options": [
				{ "id": "H02", "kind": "hero", "cost": 2 },
				{ "id": "H09", "kind": "hero", "cost": 2 },
				{ "id": "H20", "kind": "hero", "cost": 3 },
			],
		}],
	}, [{ "instanceId": "unique:run-4:U01", "itemId": "U01", "kind": "unique" }], false)
	_expect(screen.offered_option_ids() == ["H02", "H09", "H20"], "reward cards must contain exactly the three server-offered options")
	_expect(screen.get_selectable_option_count() == 3, "reward screen must not generate a fourth local option")
	var offered_card: Button = screen.find_child("RewardOption_H02", true, false) as Button
	_expect(offered_card != null and offered_card.get_theme_color("font_color").is_equal_approx(ThemeTokensScript.PARCHMENT), "dark reward cards must use high-contrast parchment text")
	_expect(offered_card != null and offered_card.text.contains("Ember Duelist") and not offered_card.text.contains("H02"), "reward hero cards must display the player-facing hero name rather than a raw hero key")
	_expect(offered_card != null and not offered_card.tooltip_text.contains("H02") and not offered_card.tooltip_text.contains("reward:"), "reward tooltips must describe the player-facing choice rather than raw offer or hero IDs")
	var animated_reveal: Control = screen.find_child("UniqueRevealPanel", true, false) as Control
	var animated_tweens: Array = screen.get("_reveal_tweens")
	_expect(animated_reveal != null and animated_reveal.modulate.a < 1.0 and animated_tweens.size() == 1, "normal R4 Unique reveal must start as a visible tweened transition, not only expose a duration value")
	if animated_reveal != null and not animated_tweens.is_empty():
		var initial_alpha := animated_reveal.modulate.a
		animated_tweens.front().custom_step(0.05)
		_expect(animated_reveal.modulate.a > initial_alpha and animated_reveal.modulate.a < 1.0, "normal R4 Unique reveal must visibly advance while animating")
	_expect(not screen.is_selection_complete(), "the claim state must remain incomplete until every server offer is selected")
	screen.choose_server_option("reward:4:hero_choice:1", "H09")
	_expect(selected == [["reward:4:hero_choice:1", "H09"]], "an offered card must emit its immutable offer and option IDs")
	_expect(screen.is_selection_complete(), "one selected option must complete a one-offer reward")
	screen.choose_server_option("reward:4:hero_choice:1", "H99")
	_expect(selected.size() == 1, "a client-created option must never emit a selection")
	_expect(screen.unique_reveal_ids() == ["unique:run-4:U01"], "round four must expose existing server-owned Unique item reveals")
	_expect(screen.find_child("UniqueHero", true, false) == null, "future Unique heroes must remain deferred")
	screen.acknowledge_unique("unique:run-4:U01")
	_expect(acknowledged == ["unique:run-4:U01"], "acknowledging an existing Unique item must emit its server reveal ID")
	screen.bind_reward({ "round": 4, "offers": [] }, [{ "instanceId": "unique:run-4:U01", "itemId": "U01", "kind": "unique" }], true)
	var static_reveal: Control = screen.find_child("UniqueRevealPanel", true, false) as Control
	var static_tweens: Array = screen.get("_reveal_tweens")
	_expect(static_reveal != null and static_reveal.modulate.a == 1.0 and static_tweens.is_empty(), "reduced motion must render the Unique result immediately readable with no tween or animation")
	if static_reveal != null:
		_expect(static_reveal.modulate.a == 1.0, "reduced motion must not leave a Unique reveal tween or animation running")
	screen.bind_reward({ "round": 1, "offers": [{ "id": "reward:unknown", "kind": "hero_choice", "options": [{ "id": "H99", "kind": "hero" }] }] }, [], true)
	var unknown_hero_card: Button = screen.find_child("RewardOption_H99", true, false) as Button
	_expect(unknown_hero_card != null and unknown_hero_card.text.contains("Unknown hero") and not unknown_hero_card.text.contains("H99") and not unknown_hero_card.tooltip_text.contains("H99"), "an unresolved reward hero must use a friendly fallback without exposing its raw ID")
	screen.free()
	_finish()

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_failed = true
		push_error(message)

func _finish() -> void:
	if _failed:
		quit(1)
		return
	print("PASS reward_screen_test")
	quit(0)
