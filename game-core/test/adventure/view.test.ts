import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  buildAdventureView,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
  recordAdventureCombatResult,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function preparedWithHero() {
  const initial = createAdventureGame({ id: "view-run", seed: "view-seed", content, rules });
  const slot = initial.run.shop[0];
  if (slot === null || slot === undefined) throw new Error("Initial test shop is empty");
  const bought = applyAdventureCommand(initial, {
    commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
  }, rules).state;
  const moved = applyAdventureCommand(bought, {
    commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
    heroInstanceId: "hero:view-run:buy", destination: { kind: "board", index: 15 },
  }, rules).state;
  return { state: moved, heroId: slot.heroId };
}

describe("presentation-safe Adventure view", () => {
  it("projects the authoritative run without private seed, pool, or receipts", () => {
    const state = createAdventureGame({ id: "view-run", seed: "secret-seed", content, rules });
    const view = buildAdventureView(state, rules, content);
    const serialized = JSON.stringify(view);

    expect(view).toMatchObject({
      id: "view-run",
      revision: 0,
      phase: "PREPARE",
      rulesetVersion: rules.version,
      contentVersion: content.version,
      level: 3,
      experience: 0,
      experienceToNext: 10,
      boardCap: 3,
      shopOdds: [55, 35, 10, 0, 0],
    });
    expect(serialized).not.toContain("secret-seed");
    expect(serialized).not.toContain("shopPool");
    expect(serialized).not.toContain("commandHistory");
    expect(serialized).not.toContain("acquisitionCounter");
  });

  it("derives species and role trait progress from distinct deployed heroes", () => {
    const { state, heroId } = preparedWithHero();
    const hero = content.heroesById.get(heroId)!;
    const view = buildAdventureView(state, rules, content);

    expect(view.board[15]?.heroId).toBe(heroId);
    expect(view.traits.map((trait) => trait.traitId).sort())
      .toEqual([hero.species_trait_id, hero.class_trait_id].sort());
    for (const trait of view.traits) {
      expect(trait.count).toBe(1);
      expect(trait.activeBreakpoint).toBeGreaterThanOrEqual(0);
    }
  });

  it("exposes pending reward and last-combat summaries only after resolution", () => {
    const { state } = preparedWithHero();
    const started = applyAdventureCommand(state, {
      commandId: "start", expectedRevision: 2, type: "START_ROUND",
    }, rules).state;
    const resolved = recordAdventureCombatResult(started, {
      commandId: "resolve", expectedRevision: 3, type: "RECORD_COMBAT_RESULT",
      round: 1,
      winner: "player",
      survivingEnemyUnits: 0,
      resultHash: "view-result",
      finalTick: 100,
      reason: "elimination",
    }, rules, content).state;
    const view = buildAdventureView(resolved, rules, content);

    expect(view.phase).toBe("REWARD");
    expect(view.pendingReward?.round).toBe(1);
    expect(view.lastCombat).toEqual(expect.objectContaining({
      round: 1,
      winner: "player",
      resultHash: "view-result",
    }));
  });
});
