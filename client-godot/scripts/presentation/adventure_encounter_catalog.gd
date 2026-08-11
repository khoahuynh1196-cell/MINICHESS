class_name AdventureEncounterCatalog
extends RefCounted

# Alpha 0.3.0 presentation projection. Combat composition and outcomes remain
# server-owned; this catalog only gives the mobile map and Prepare screen a
# stable name, biome, tier, and manifest preview for the current round.
const ENCOUNTERS := [
	{ "id": "PVE_01", "round": 1, "name": "Meadow Skirmish", "biome": "meadow", "kind": "normal", "previewMonster": "meadow", "previewPositions": [3, 5] },
	{ "id": "PVE_02", "round": 2, "name": "Meadow Crossroads", "biome": "meadow", "kind": "normal", "previewMonster": "meadow", "previewPositions": [0, 4, 7] },
	{ "id": "PVE_03", "round": 3, "name": "Ruins Ambush", "biome": "ruins", "kind": "elite", "previewMonster": "ruins_elite", "previewPositions": [0, 4, 8] },
	{ "id": "PVE_04", "round": 4, "name": "Ruins Gate", "biome": "ruins", "kind": "miniboss", "marker": "MINIBOSS", "previewMonster": "ruins_boss", "previewPositions": [0, 4, 8, 10] },
	{ "id": "PVE_05", "round": 5, "name": "Frost Keep Affix", "biome": "frost_keep", "kind": "affix", "previewMonster": "frost_keep", "previewPositions": [0, 1, 4, 8] },
	{ "id": "PVE_06", "round": 6, "name": "Frost Keep Siege", "biome": "frost_keep", "kind": "hard", "previewMonster": "frost_keep_elite", "previewPositions": [0, 4, 5, 8, 11] },
	{ "id": "PVE_07", "round": 7, "name": "Ember March", "biome": "ember_citadel", "kind": "elite", "previewMonster": "ember_citadel_elite", "previewPositions": [0, 4, 5, 8, 11] },
	{ "id": "PVE_08", "round": 8, "name": "Ember Citadel", "biome": "ember_citadel", "kind": "boss", "marker": "BOSS", "previewMonster": "ember_citadel_boss", "previewPositions": [0, 1, 4, 5, 8, 11] },
]

static func encounters() -> Array:
	return ENCOUNTERS.duplicate(true)

static func for_round(round: int) -> Dictionary:
	var index := clampi(round - 1, 0, ENCOUNTERS.size() - 1)
	return Dictionary(ENCOUNTERS[index]).duplicate(true)

static func biome_for_round(round: int) -> String:
	return String(for_round(round).get("biome", "meadow"))

static func enemy_previews_for_round(round: int) -> Array:
	var encounter := for_round(round)
	var monster_id := String(encounter.get("previewMonster", ""))
	var previews: Array = []
	for position in Array(encounter.get("previewPositions", [])):
		previews.append({ "position": int(position), "monsterId": monster_id })
	return previews
