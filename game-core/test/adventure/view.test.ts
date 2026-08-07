import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ackAdventurePlaybackComplete,
  applyAdventureCommand,
  buildAdventureView,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
  recordAdventureCombatResult,
  type AdventureGameState,
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

  it("exposes lastCombat during PLAYBACK but withholds pendingReward until ACK", () => {
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
    const playbackView = buildAdventureView(resolved, rules, content);

    expect(playbackView.phase).toBe("PLAYBACK");
    expect(playbackView.pendingReward).toBeUndefined();
    expect(playbackView.lastCombat).toEqual(expect.objectContaining({
      round: 1,
      winner: "player",
      resultHash: "view-result",
    }));

    const acked = ackAdventurePlaybackComplete(resolved, {
      commandId: "ack", expectedRevision: 4, type: "ACK_PLAYBACK_COMPLETE",
    }, rules, content).state;
    const rewardView = buildAdventureView(acked, rules, content);

    expect(rewardView.phase).toBe("REWARD");
    expect(rewardView.pendingReward?.round).toBe(1);
  });
});

describe("Adventure view action availability", () => {
  function resolveWin(state: AdventureGameState) {
    return recordAdventureCombatResult(state, {
      commandId: "resolve", expectedRevision: state.run.revision, type: "RECORD_COMBAT_RESULT",
      round: state.run.round, winner: "player", survivingEnemyUnits: 0,
      resultHash: `actions-${state.run.round}`, finalTick: 100, reason: "elimination",
    }, rules, content).state;
  }

  it("computes PREPARE-phase reasons a Godot client can read without re-deriving rules", () => {
    const fresh = createAdventureGame({ id: "actions-run", seed: "actions-seed", content, rules });
    const view = buildAdventureView(fresh, rules, content);

    expect(view.actions.refreshShop).toEqual({ allowed: true });
    expect(view.actions.lockShop).toEqual({ allowed: true });
    expect(view.actions.startRound).toEqual({ allowed: false, reason: "EMPTY_BOARD" });
    expect(view.actions.claimRewardHero).toEqual({ allowed: false, reason: "NO_PENDING_HERO_REWARD" });
    expect(view.actions.resolveCombat).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(view.actions.ackPlaybackComplete).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(view.actions.claimRoundReward).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(view.actions.moveHero).toEqual({ allowed: true });
    expect(view.actions.buyShopSlots).toHaveLength(rules.shop.slotCount);
    expect(view.actions.buyShopSlots[0]).toEqual({ allowed: true });

    const noGold = buildAdventureView({ ...fresh, run: { ...fresh.run, gold: 0 } }, rules, content);
    expect(noGold.actions.buyXp).toEqual({ allowed: false, reason: "NOT_ENOUGH_GOLD" });
    expect(noGold.actions.buyShopSlots[0]).toEqual({ allowed: false, reason: "NOT_ENOUGH_GOLD" });

    const locked = buildAdventureView({ ...fresh, run: { ...fresh.run, shopLocked: true } }, rules, content);
    expect(locked.actions.refreshShop).toEqual({ allowed: false, reason: "SHOP_LOCKED" });

    const emptySlotIndex = fresh.run.shop.findIndex((slot) => slot === null);
    if (emptySlotIndex >= 0) expect(view.actions.buyShopSlots[emptySlotIndex]).toEqual({ allowed: false, reason: "SLOT_EMPTY" });
  });

  it("flips resolveCombat/ackPlaybackComplete/claimRoundReward with phase, and locks roster actions outside PREPARE", () => {
    const started = applyAdventureCommand(
      applyAdventureCommand(
        createAdventureGame({ id: "actions-phase-run", seed: "actions-phase-seed", content, rules }),
        { commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0 }, rules,
      ).state,
      { commandId: "move", expectedRevision: 1, type: "MOVE_HERO", heroInstanceId: "hero:actions-phase-run:buy", destination: { kind: "board", index: 0 } }, rules,
    ).state;
    const combat = applyAdventureCommand(started, { commandId: "start", expectedRevision: 2, type: "START_ROUND" }, rules).state;
    const combatView = buildAdventureView(combat, rules, content);
    expect(combatView.actions.resolveCombat).toEqual({ allowed: true });
    expect(combatView.actions.moveHero).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(combatView.actions.sellHero).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(combatView.actions.equipItem).toEqual({ allowed: false, reason: "WRONG_PHASE" });
    expect(combatView.actions.unequipItem).toEqual({ allowed: false, reason: "WRONG_PHASE" });

    const playback = resolveWin(combat);
    const playbackView = buildAdventureView(playback, rules, content);
    expect(playbackView.actions.ackPlaybackComplete).toEqual({ allowed: true });
    expect(playbackView.actions.claimRoundReward).toEqual({ allowed: false, reason: "WRONG_PHASE" });

    const rewardState = ackAdventurePlaybackComplete(playback, {
      commandId: "ack", expectedRevision: playback.run.revision, type: "ACK_PLAYBACK_COMPLETE",
    }, rules, content).state;
    const rewardView = buildAdventureView(rewardState, rules, content);
    expect(rewardView.actions.claimRoundReward).toEqual({ allowed: true });
    expect(rewardView.actions.ackPlaybackComplete).toEqual({ allowed: false, reason: "WRONG_PHASE" });
  });
});
