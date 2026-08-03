class_name HeroVisualCatalog
extends RefCounted

const RIG_SCHEMA_VERSION := "1.0.0"

# The catalog is presentation-only: simulation remains authoritative in game-core.
static var SHOP_RARITIES: Dictionary = {
	"H01": 1, "H02": 2, "H03": 1, "H04": 3, "H05": 2,
	"H06": 1, "H07": 2, "H08": 2, "H09": 3, "H10": 2,
	"H11": 1, "H12": 1, "H13": 3, "H14": 2, "H15": 1,
	"H16": 3, "H17": 2, "H18": 3, "H19": 3, "H20": 3,
}

static var PROFILES: Dictionary = {
	"H01": _profile("H01", "Cotton Bulwark", "cat", "guardian", "Cotton Bulwark", "shield", "guard", "barrier", "guard", "#9ed8c3", "h01-cotton-shield-cat-chibi-v2.png"),
	"H02": _profile("H02", "Ember Duelist", "cat", "fighter", "Prowler's Leap", "sword", "slash", "dash", "slash", "#f26a4f", "h02-ember-duelist-cat-chibi-v2.png"),
	"H03": _profile("H03", "Forest Ranger", "cat", "ranger", "Razor Shot", "bow", "shot", "leaf_arrow", "bow", "#78b86b", "h03-forest-ranger-cat-chibi-v2.png"),
	"H04": _profile("H04", "Frost Mage", "cat", "mage", "Winter Howl", "staff", "cast", "frost_wave", "frost", "#82c8ee", "h04-frost-mage-cat-chibi-v2.png"),
	"H05": _profile("H05", "Lantern Healer", "cat", "support", "Kindred Mend", "lantern", "swing", "heal_bloom", "chime", "#f6c768", "h05-lantern-healer-cat-chibi-v2.png"),
	"H06": _profile("H06", "Moonshield", "dog", "guardian", "Pack Guard", "shield", "guard", "moon_barrier", "guard", "#9ca9dc", "h06-moonshield-dog-chibi-v2.png"),
	"H07": _profile("H07", "Scarf Brawler", "dog", "fighter", "Bramble Bash", "fists", "punch", "bramble_impact", "punch", "#b87b55", "h07-scarf-brawler-dog-chibi-v2.png"),
	"H08": _profile("H08", "Hooded Ranger", "dog", "ranger", "Hunter's Focus", "crossbow", "shot", "focus_mark", "bow", "#6c985f", "h08-hooded-ranger-dog-chibi-v2.png"),
	"H09": _profile("H09", "Star Mage", "dog", "mage", "Storm Arc", "wand", "cast", "star_arc", "magic", "#8f83d8", "h09-star-mage-dog-chibi-v2.png"),
	"H10": _profile("H10", "Medic Dog", "dog", "support", "Moonlit Ward", "satchel", "throw", "moon_ward", "chime", "#91d1ad", "h10-medic-dog-chibi-v2.png"),
	"H11": _profile("H11", "Dashing Rabbit", "rabbit", "fighter", "Burrow Charge", "spear", "thrust", "burrow_dash", "charge", "#da8f76", "h11-dashing-rabbit-fighter-chibi-v2.png"),
	"H12": _profile("H12", "Hooded Rabbit Ranger", "rabbit", "ranger", "Thistle Volley", "bow", "shot", "thistle_volley", "bow", "#9eae69", "h12-hooded-rabbit-ranger-chibi-v2.png"),
	"H13": _profile("H13", "Potion Rabbit", "rabbit", "mage", "Searing Spores", "flask", "throw", "spore_cloud", "magic", "#cf8057", "h13-potion-rabbit-mage-chibi-v2.png"),
	"H14": _profile("H14", "Rabbit Healer", "rabbit", "support", "Meadow Remedy", "wand", "cast", "remedy_bloom", "chime", "#e58fb0", "h14-rabbit-healer-chibi-v2.png"),
	"H15": _profile("H15", "Bulwark Cow", "cow", "guardian", "Earthen Decoy", "tower_shield", "guard", "earth_decoy", "guard", "#b99361", "h15-bulwark-cow-chibi-v2.png"),
	"H16": _profile("H16", "Hammer Cow", "cow", "fighter", "Hornbreaker", "hammer", "smash", "horn_shock", "hammer", "#d36748", "h16-hammer-cow-fighter-chibi-v2.png"),
	"H17": _profile("H17", "Lantern Cow", "cow", "support", "Purifying Bloom", "lantern", "swing", "purify_bloom", "chime", "#cfb169", "h17-lantern-cow-support-chibi-v2.png"),
	"H18": _profile("H18", "Red Panda Ranger", "exotic", "ranger", "Exotic Ricochet", "chakram", "throw", "ricochet", "bow", "#db765d", "h18-red-panda-ranger-chibi-v2.png"),
	"H19": _profile("H19", "Owl Mage", "exotic", "mage", "Prismatic Burst", "tome", "cast", "prismatic_burst", "magic", "#9c82d4", "h19-owl-mage-chibi-v2.png"),
	"H20": _profile("H20", "Capybara Guardian", "exotic", "guardian", "Last Stand Shell", "shell", "guard", "shell_bastion", "guard", "#7eaf9d", "h20-capybara-guardian-chibi-v3.png"),
}

static func profile(hero_id: String) -> Dictionary:
	var fallback: Dictionary = PROFILES["H01"]
	return Dictionary(PROFILES.get(hero_id, fallback)).duplicate(true)

static func hero_ids() -> Array[String]:
	var ids: Array[String] = []
	for hero_id in PROFILES:
		ids.append(hero_id)
	ids.sort()
	return ids

static func source_asset_path(hero_id: String) -> String:
	var profile_data := profile(hero_id)
	return "res://assets/sprites/%s" % String(profile_data.source_sprite)

static func _profile(id: String, display_name: String, species: String, role: String, skill_name: String, weapon_style: String, attack_motion: String, skill_cue: String, sound_cue: String, accent: String, source_sprite: String) -> Dictionary:
	return {
		"id": id,
		"display_name": display_name,
		"rarity": int(SHOP_RARITIES.get(id, 1)),
		"species": species,
		"role": role,
		"skill_name": skill_name,
		"source_sprite": source_sprite,
		"palette": { "accent": accent, "hit": "#ff7c7c", "death": "#596275" },
		"weapon": { "anchor": "Weapon", "style": weapon_style, "color": accent },
		"motion": { "basic_attack": attack_motion, "skill_cast": skill_cue },
		"vfx": { "basic_attack": "attack_flash", "skill_cast": skill_cue, "hit": "hit_spark", "death": "defeat_puff" },
		"sfx": { "basic_attack": sound_cue, "skill_cast": sound_cue, "hit": "hit", "death": "defeat" },
		"anchors": {
			"Head": Vector2(0.0, -45.0),
			"Chest": Vector2(0.0, -20.0),
			"Back": Vector2(-18.0, -22.0),
			"Weapon": Vector2(31.0, -18.0),
			"Feet": Vector2(0.0, 35.0),
		},
		"required_layers": ["body", "head", "arm_back", "arm_front", "leg_back", "leg_front", "weapon", "fx_mask"],
		"animations": ["idle", "move", "basic_attack", "hit", "skill_cast", "death"],
	}
