import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  buildAdventureCombatSnapshot,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
  freezeAdventureGameState,
  type CompiledContentBundle,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function combatReady(localPosition = 15) {
  const initial = createAdventureGame({ id: "snapshot-run", seed: "snapshot-seed", content, rules });
  const bought = applyAdventureCommand(initial, {
    commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
  }, rules).state;
  const moved = applyAdventureCommand(bought, {
    commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
    heroInstanceId: "hero:snapshot-run:buy", destination: { kind: "board", index: localPosition },
  }, rules).state;
  const withItems = freezeAdventureGameState({
    ...moved,
    run: {
      ...moved.run,
      items: [
        { instanceId: "item-b", itemId: "I02", kind: "normal", equippedHeroInstanceId: "hero:snapshot-run:buy" },
        { instanceId: "item-a", itemId: "I01", kind: "normal", equippedHeroInstanceId: "hero:snapshot-run:buy" },
      ],
    },
  });
  return applyAdventureCommand(withItems, {
    commandId: "start", expectedRevision: 2, type: "START_ROUND",
  }, rules).state;
}

describe("immutable Adventure combat snapshot", () => {
  it("maps the player half to global cells 16 through 31 independent of board cap", () => {
    const snapshot = buildAdventureCombatSnapshot(combatReady(15), rules, content);

    expect(snapshot.board).toEqual({
      columns: 4,
      rows: 8,
      enemyRows: { start: 0, end: 3 },
      playerRows: { start: 4, end: 7 },
    });
    expect(snapshot.playerUnits).toEqual([expect.objectContaining({
      unitId: "player:hero:snapshot-run:buy",
      globalPosition: 31,
      itemIds: ["I01", "I02"],
    })]);
    expect(snapshot.enemyUnits.every((unit) => unit.globalPosition >= 0 && unit.globalPosition <= 15)).toBe(true);
  });

  it("locks versions, timing, encounter, seed, and a deterministic snapshot hash", () => {
    const state = combatReady(0);
    const first = buildAdventureCombatSnapshot(state, rules, content);
    const second = buildAdventureCombatSnapshot(state, rules, content);

    expect(second).toEqual(first);
    expect(first).toMatchObject({
      combatId: "combat:snapshot-run:1:3",
      runId: "snapshot-run",
      round: 1,
      rulesetVersion: rules.version,
      rulesetHash: rules.rulesetHash,
      contentVersion: content.version,
      contentHash: content.contentHash,
      tickRate: 20,
      maxTicks: 700,
      encounterId: content.encounters[0]!.id,
    });
    expect(first.combatSeed).toMatch(/^[0-9a-f]{64}$/);
    expect(first.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("rejects snapshot construction before combat", () => {
    const initial = createAdventureGame({ id: "not-ready", seed: "not-ready-seed", content, rules });
    expect(() => buildAdventureCombatSnapshot(initial, rules, content))
      .toThrow("ADVENTURE_COMBAT_SNAPSHOT_NOT_ALLOWED");
  });

  it("rejects enemy content placed outside the enemy half", () => {
    const encounters = content.encounters.map((encounter, encounterIndex) => {
      if (encounterIndex !== 0 || encounter.enemy_composition === undefined) return encounter;
      return Object.freeze({
        ...encounter,
        enemy_composition: Object.freeze(encounter.enemy_composition.map((enemy, index) =>
          index === 0 ? Object.freeze({ ...enemy, position: 16 }) : enemy)),
      });
    });
    const invalidContent = Object.freeze({ ...content, encounters: Object.freeze(encounters) }) as CompiledContentBundle;

    expect(() => buildAdventureCombatSnapshot(combatReady(), rules, invalidContent))
      .toThrow("ADVENTURE_ENEMY_POSITION_INVALID");
  });

  it("rejects a missing or empty encounter", () => {
    const noEncounter = Object.freeze({ ...content, encounters: Object.freeze(content.encounters.slice(1)) }) as CompiledContentBundle;
    expect(() => buildAdventureCombatSnapshot(combatReady(), rules, noEncounter))
      .toThrow("ADVENTURE_ENCOUNTER_MISSING:1");
  });
});
