extends SceneTree

const CONTROLLER_PATH := "res://scripts/battle_controller.gd"
const CombatEventScript = preload("res://scripts/combat_event.gd")

func _init() -> void:
	set_meta("failed", false)
	var controller_script := load(CONTROLLER_PATH)
	if controller_script == null:
		_fail("BattleController script is missing")
		return

	var controller = controller_script.new()
	controller.apply_event(_event("UNIT_SPAWNED", "player:H01:1", "", { "side": "player", "position": 22, "max_hp": 100000 }))
	controller.apply_event(_event("BASIC_ATTACK", "player:H01:1", "enemy:E01:1", {}))
	_expect(controller.unit_views["player:H01:1"].get("animation_state") == "basic_attack", "basic attack must set the source presentation state")
	controller.apply_event(_event("DAMAGE_APPLIED", "", "player:H01:1", { "remaining_hp": 75000 }))
	_expect(controller.unit_views["player:H01:1"].get("animation_state") == "hit", "damage must set the target presentation state")
	controller.apply_event(_event("SHIELD_APPLIED", "player:H01:1", "player:H01:1", {}))
	_expect(controller.unit_views["player:H01:1"].get("animation_state") == "skill", "shield effects must present as a protective skill VFX")
	controller.apply_event(_event("CAST_STARTED", "player:H01:1", "enemy:E01:1", {}))
	_expect(controller.unit_views["player:H01:1"].get("animation_state") == "skill", "cast start must set the source presentation state")
	controller.apply_event(_event("STUN_APPLIED", "enemy:E01:1", "player:H01:1", {}))
	_expect(controller.unit_views["player:H01:1"].get("animation_state") == "hit", "stun effects must present a target hit reaction")
	_expect(controller.unit_views.has("player:H01:1"), "spawn must create a unit view")
	_expect(controller.unit_views["player:H01:1"].grid_index == 22, "spawn must place the unit on its grid index")
	_expect(controller.unit_views["player:H01:1"].get("hero_id") == "H01", "spawn must retain the hero ID for a readable board label")
	controller.apply_event(_event("UNIT_SPAWNED", "enemy:H15:1", "", { "side": "enemy", "position": 1, "max_hp": 90000 }))
	var monster = controller.unit_views["enemy:H15:1"]
	_expect(monster.get("monster_id") == "meadow", "enemy spawn must map to a biome monster view")
	var monster_cutout = monster.get_node_or_null("Cutout")
	_expect(monster_cutout != null and monster_cutout.texture != null and monster_cutout.texture.resource_path == "res://assets/monsters/meadow-moss-goblin-scout-v1.png", "enemy spawn must use the individual meadow cutout")
	controller.apply_event(_event("UNIT_SPAWNED", "enemy:PVE_03:0", "", { "side": "enemy", "position": 4, "max_hp": 120000 }))
	var ruins_elite = controller.unit_views["enemy:PVE_03:0"]
	_expect(ruins_elite.get("monster_id") == "ruins_elite", "production PVE_03 IDs must select the Ruins elite monster key")
	_expect(ruins_elite.get_node_or_null("Cutout").texture.resource_path == "res://assets/monsters/ruins-bronze-wraith-elite-v1.png", "PVE_03 must resolve the Ruins elite texture")
	var biome_layer = controller.get_node_or_null("BiomeLayer")
	_expect(biome_layer != null and biome_layer.texture != null, "a production encounter must attach its manifest-backed biome layer")
	controller.apply_event(_event("UNIT_SPAWNED", "enemy:PVE_08:0", "", { "side": "enemy", "position": 7, "max_hp": 300000 }))
	var ember_boss = controller.unit_views["enemy:PVE_08:0"]
	_expect(ember_boss.get("monster_id") == "ember_citadel_boss", "production PVE_08 IDs must select the Ember boss monster key")
	_expect(ember_boss.get_node_or_null("Cutout").texture.resource_path == "res://assets/monsters/ember-imp-knight-v1.png", "PVE_08 must resolve the Ember boss texture")
	var portrait = controller.unit_views["player:H01:1"].get_node_or_null("Portrait")
	_expect(portrait != null and portrait.texture != null and portrait.texture.resource_path == "res://assets/sprites/h01-cotton-shield-cat-chibi-v2.png", "H01 spawn must render the chibi full-body character texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H02:1", "", { "side": "player", "position": 21, "max_hp": 100000 }))
	var duelist_portrait = controller.unit_views["player:H02:1"].get_node_or_null("Portrait")
	_expect(duelist_portrait != null and duelist_portrait.texture != null and duelist_portrait.texture.resource_path == "res://assets/sprites/h02-ember-duelist-cat-chibi-v2.png", "H02 spawn must render the chibi duelist texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H03:1", "", { "side": "player", "position": 20, "max_hp": 100000 }))
	var ranger_portrait = controller.unit_views["player:H03:1"].get_node_or_null("Portrait")
	_expect(ranger_portrait != null and ranger_portrait.texture != null and ranger_portrait.texture.resource_path == "res://assets/sprites/h03-forest-ranger-cat-chibi-v2.png", "H03 spawn must render the chibi ranger texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H04:1", "", { "side": "player", "position": 19, "max_hp": 100000 }))
	var mage_portrait = controller.unit_views["player:H04:1"].get_node_or_null("Portrait")
	_expect(mage_portrait != null and mage_portrait.texture != null and mage_portrait.texture.resource_path == "res://assets/sprites/h04-frost-mage-cat-chibi-v2.png", "H04 spawn must render the chibi mage texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H05:1", "", { "side": "player", "position": 18, "max_hp": 100000 }))
	var healer_portrait = controller.unit_views["player:H05:1"].get_node_or_null("Portrait")
	_expect(healer_portrait != null and healer_portrait.texture != null and healer_portrait.texture.resource_path == "res://assets/sprites/h05-lantern-healer-cat-chibi-v2.png", "H05 spawn must render the chibi healer texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H06:1", "", { "side": "player", "position": 17, "max_hp": 100000 }))
	var guardian_portrait = controller.unit_views["player:H06:1"].get_node_or_null("Portrait")
	_expect(guardian_portrait != null and guardian_portrait.texture != null and guardian_portrait.texture.resource_path == "res://assets/sprites/h06-moonshield-dog-chibi-v2.png", "H06 spawn must render the chibi dog guardian texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H07:1", "", { "side": "player", "position": 16, "max_hp": 100000 }))
	var fighter_portrait = controller.unit_views["player:H07:1"].get_node_or_null("Portrait")
	_expect(fighter_portrait != null and fighter_portrait.texture != null and fighter_portrait.texture.resource_path == "res://assets/sprites/h07-scarf-brawler-dog-chibi-v2.png", "H07 spawn must render the chibi dog fighter texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H08:1", "", { "side": "player", "position": 15, "max_hp": 100000 }))
	var dog_ranger_portrait = controller.unit_views["player:H08:1"].get_node_or_null("Portrait")
	_expect(dog_ranger_portrait != null and dog_ranger_portrait.texture != null and dog_ranger_portrait.texture.resource_path == "res://assets/sprites/h08-hooded-ranger-dog-chibi-v2.png", "H08 spawn must render the chibi dog ranger texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H09:1", "", { "side": "player", "position": 14, "max_hp": 100000 }))
	var dog_mage_portrait = controller.unit_views["player:H09:1"].get_node_or_null("Portrait")
	_expect(dog_mage_portrait != null and dog_mage_portrait.texture != null and dog_mage_portrait.texture.resource_path == "res://assets/sprites/h09-star-mage-dog-chibi-v2.png", "H09 spawn must render the chibi dog mage texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H10:1", "", { "side": "player", "position": 13, "max_hp": 100000 }))
	var dog_support_portrait = controller.unit_views["player:H10:1"].get_node_or_null("Portrait")
	_expect(dog_support_portrait != null and dog_support_portrait.texture != null and dog_support_portrait.texture.resource_path == "res://assets/sprites/h10-medic-dog-chibi-v2.png", "H10 spawn must render the chibi dog support texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H11:1", "", { "side": "player", "position": 12, "max_hp": 100000 }))
	var rabbit_fighter_portrait = controller.unit_views["player:H11:1"].get_node_or_null("Portrait")
	_expect(rabbit_fighter_portrait != null and rabbit_fighter_portrait.texture != null and rabbit_fighter_portrait.texture.resource_path == "res://assets/sprites/h11-dashing-rabbit-fighter-chibi-v2.png", "H11 spawn must render the chibi rabbit fighter texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H12:1", "", { "side": "player", "position": 11, "max_hp": 100000 }))
	var rabbit_ranger_portrait = controller.unit_views["player:H12:1"].get_node_or_null("Portrait")
	_expect(rabbit_ranger_portrait != null and rabbit_ranger_portrait.texture != null and rabbit_ranger_portrait.texture.resource_path == "res://assets/sprites/h12-hooded-rabbit-ranger-chibi-v2.png", "H12 spawn must render the chibi rabbit ranger texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H13:1", "", { "side": "player", "position": 10, "max_hp": 100000 }))
	var rabbit_mage_portrait = controller.unit_views["player:H13:1"].get_node_or_null("Portrait")
	_expect(rabbit_mage_portrait != null and rabbit_mage_portrait.texture != null and rabbit_mage_portrait.texture.resource_path == "res://assets/sprites/h13-potion-rabbit-mage-chibi-v2.png", "H13 spawn must render the chibi rabbit mage texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H14:1", "", { "side": "player", "position": 9, "max_hp": 100000 }))
	var rabbit_support_portrait = controller.unit_views["player:H14:1"].get_node_or_null("Portrait")
	_expect(rabbit_support_portrait != null and rabbit_support_portrait.texture != null and rabbit_support_portrait.texture.resource_path == "res://assets/sprites/h14-rabbit-healer-chibi-v2.png", "H14 spawn must render the chibi rabbit support texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H15:1", "", { "side": "player", "position": 8, "max_hp": 100000 }))
	var cow_guardian_portrait = controller.unit_views["player:H15:1"].get_node_or_null("Portrait")
	_expect(cow_guardian_portrait != null and cow_guardian_portrait.texture != null and cow_guardian_portrait.texture.resource_path == "res://assets/sprites/h15-bulwark-cow-chibi-v2.png", "H15 spawn must render the chibi cow guardian texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H16:1", "", { "side": "player", "position": 7, "max_hp": 100000 }))
	var cow_fighter_portrait = controller.unit_views["player:H16:1"].get_node_or_null("Portrait")
	_expect(cow_fighter_portrait != null and cow_fighter_portrait.texture != null and cow_fighter_portrait.texture.resource_path == "res://assets/sprites/h16-hammer-cow-fighter-chibi-v2.png", "H16 spawn must render the chibi cow fighter texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H17:1", "", { "side": "player", "position": 6, "max_hp": 80000 }))
	var cow_support_portrait = controller.unit_views["player:H17:1"].get_node_or_null("Portrait")
	_expect(cow_support_portrait != null and cow_support_portrait.texture != null and cow_support_portrait.texture.resource_path == "res://assets/sprites/h17-lantern-cow-support-chibi-v2.png", "H17 spawn must render the chibi cow support texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H18:1", "", { "side": "player", "position": 5, "max_hp": 70000 }))
	var exotic_ranger_portrait = controller.unit_views["player:H18:1"].get_node_or_null("Portrait")
	_expect(exotic_ranger_portrait != null and exotic_ranger_portrait.texture != null and exotic_ranger_portrait.texture.resource_path == "res://assets/sprites/h18-red-panda-ranger-chibi-v2.png", "H18 spawn must render the chibi Exotic ranger texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H19:1", "", { "side": "player", "position": 4, "max_hp": 65000 }))
	var exotic_mage_portrait = controller.unit_views["player:H19:1"].get_node_or_null("Portrait")
	_expect(exotic_mage_portrait != null and exotic_mage_portrait.texture != null and exotic_mage_portrait.texture.resource_path == "res://assets/sprites/h19-owl-mage-chibi-v2.png", "H19 spawn must render the chibi Exotic mage texture")
	controller.apply_event(_event("UNIT_SPAWNED", "player:H20:1", "", { "side": "player", "position": 3, "max_hp": 95000 }))
	var exotic_guardian_portrait = controller.unit_views["player:H20:1"].get_node_or_null("Portrait")
	_expect(exotic_guardian_portrait != null and exotic_guardian_portrait.texture != null and exotic_guardian_portrait.texture.resource_path == "res://assets/sprites/h20-capybara-guardian-chibi-v3.png", "H20 spawn must render the capybara guardian texture")
	_expect(controller.unit_views["player:H01:1"].hp == 75000, "damage must update rendered HP")
	controller.free()
	if bool(get_meta("failed")):
		quit(1)
	print("PASS battle_controller_test")
	quit(0)

func _event(type: String, source_unit_id: String, target_unit_id: String, payload: Dictionary):
	return CombatEventScript.from_dictionary({
		"sequence": 0,
		"tick": 0,
		"type": type,
		"source_unit_id": source_unit_id,
		"target_unit_id": target_unit_id,
		"payload": payload,
	})

func _expect(condition: bool, message: String) -> void:
	if not condition:
		_fail(message)

func _fail(message: String) -> void:
	set_meta("failed", true)
	push_error(message)
