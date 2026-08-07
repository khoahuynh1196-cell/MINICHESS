import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adventureShopRemainingCopies,
  applyAdventureCommand,
  buildAdventureRewardPlan,
  claimAdventureRoundReward,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
  freezeAdventureGameState,
  recordAdventureCombatResult,
  type AdventureGameState,
  type AdventureRewardPlan,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function freshGame() {
  return createAdventureGame({ id: "run-lifecycle", seed: "run-lifecycle-seed", content, rules });
}

function combatReady(round = 1): AdventureGameState {
  const initial = freshGame();
  const slot = initial.run.shop[0];
  if (slot === null || slot === undefined) throw new Error("Initial test shop is empty");
  const bought = applyAdventureCommand(initial, {
    commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
  }, rules).state;
  const moved = applyAdventureCommand(bought, {
    commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
    heroInstanceId: "hero:run-lifecycle:buy", destination: { kind: "board", index: 0 },
  }, rules).state;
  const started = applyAdventureCommand(moved, {
    commandId: "start", expectedRevision: 2, type: "START_ROUND",
  }, rules).state;
  if (round === 1) return started;
  return freezeAdventureGameState({
    ...started,
    run: { ...started.run, round },
  });
}

function recordWin(state: AdventureGameState, commandId = "combat-result") {
  return recordAdventureCombatResult(state, {
    commandId,
    expectedRevision: state.run.revision,
    type: "RECORD_COMBAT_RESULT",
    round: state.run.round,
    winner: "player",
    survivingEnemyUnits: 0,
    resultHash: `result-${state.run.round}`,
    finalTick: 120,
    reason: "elimination",
  }, rules, content);
}

describe("Adventure combat and reward lifecycle", () => {
  it("records a victory, creates the deterministic reward plan, and replays once", () => {
    const started = combatReady();
    const result = recordWin(started);
    const replay = recordWin(result.state);

    expect(result).toMatchObject({ revision: 4, replayed: false });
    expect(result.state.run).toMatchObject({ phase: "REWARD", health: 30, round: 1, revision: 4 });
    expect(result.state.pendingReward)
      .toEqual(buildAdventureRewardPlan({ seed: started.seed, round: 1, content }));
    expect(result.state.lastCombat).toMatchObject({ winner: "player", round: 1, resultHash: "result-1" });
    expect(replay).toEqual({ state: result.state, revision: 4, replayed: true });
  });

  it("applies rules-driven capped loss damage", () => {
    const started = combatReady();
    const result = recordAdventureCombatResult(started, {
      commandId: "loss",
      expectedRevision: 3,
      type: "RECORD_COMBAT_RESULT",
      round: 1,
      winner: "enemy",
      survivingEnemyUnits: 9,
      resultHash: "loss-result",
      finalTick: 200,
      reason: "elimination",
    }, rules, content);

    expect(result.state.run).toMatchObject({ phase: "REWARD", health: 18 });
  });

  it("completes the run without rewards when loss damage reaches zero health", () => {
    const started = combatReady();
    const lowHealth = freezeAdventureGameState({
      ...started,
      run: { ...started.run, health: 4 },
    });
    const result = recordAdventureCombatResult(lowHealth, {
      commandId: "fatal-loss",
      expectedRevision: 3,
      type: "RECORD_COMBAT_RESULT",
      round: 1,
      winner: "enemy",
      survivingEnemyUnits: 0,
      resultHash: "fatal-result",
      finalTick: 200,
      reason: "elimination",
    }, rules, content);

    expect(result.state.run).toMatchObject({ phase: "COMPLETE", health: 0 });
    expect(result.state.pendingReward).toBeUndefined();
  });

  it("claims a reward once, grants base income, and advances the round", () => {
    const rewarded = recordWin(combatReady()).state;
    const plan = rewarded.pendingReward!;
    const selections = plan.offers.map((offer) => ({ offerId: offer.id, optionId: offer.options[0]!.id }));
    const claimed = claimAdventureRoundReward(rewarded, {
      commandId: "claim",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections,
    }, rules, content);
    const replayed = claimAdventureRoundReward(claimed.state, {
      commandId: "claim",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections,
    }, rules, content);

    expect(claimed.state.run).toMatchObject({ phase: "PREPARE", round: 2, revision: 5 });
    expect(claimed.state.run.gold).toBe(rewarded.run.gold + 5 + plan.supplementalGold);
    expect(claimed.state.run.freeRefreshes).toBe(plan.freeRefreshes);
    expect(claimed.state.pendingReward).toBeUndefined();
    expect(replayed).toEqual({ state: claimed.state, revision: 5, replayed: true });
  });

  it("materializes the round-four Unique selection as one team item", () => {
    const rewarded = recordWin(combatReady(4)).state;
    const uniqueOffer = rewarded.pendingReward?.offers.find((offer) => offer.kind === "unique_choice");
    if (uniqueOffer === undefined) throw new Error("Round four has no Unique offer");
    const unique = uniqueOffer.options[0]!;
    const selections = rewarded.pendingReward!.offers.map((offer) => ({
      offerId: offer.id,
      optionId: offer.id === uniqueOffer.id ? unique.id : offer.options[0]!.id,
    }));
    const claimed = claimAdventureRoundReward(rewarded, {
      commandId: "claim-unique",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections,
    }, rules, content);

    expect(claimed.state.run.items.filter((item) => item.kind === "unique"))
      .toEqual([expect.objectContaining({ itemId: unique.id, kind: "unique" })]);
  });

  it("queues a selected hero reward and reserves exactly one pool copy", () => {
    const started = combatReady();
    const hero = content.heroesById.get("H01")!;
    const customPlan: AdventureRewardPlan = Object.freeze({
      round: 1,
      supplementalGold: 0,
      freeRefreshes: 0,
      offers: Object.freeze([Object.freeze({
        id: "custom-hero-offer",
        kind: "hero_choice",
        options: Object.freeze([Object.freeze({ id: hero.id, kind: "hero", cost: hero.cost })]),
      })]),
    });
    const rewardState = freezeAdventureGameState({
      ...started,
      run: { ...started.run, phase: "REWARD" },
      pendingReward: customPlan,
      lastCombat: {
        round: 1,
        winner: "player",
        survivingEnemyUnits: 0,
        resultHash: "hero-reward-result",
        finalTick: 100,
        reason: "elimination",
      },
    });
    const before = adventureShopRemainingCopies(rewardState.shopPool, hero.id);
    const claimed = claimAdventureRoundReward(rewardState, {
      commandId: "claim-hero",
      expectedRevision: 3,
      type: "CLAIM_ROUND_REWARD",
      selections: [{ offerId: "custom-hero-offer", optionId: hero.id }],
    }, rules, content);

    expect(claimed.state.run.rewardHeroes).toEqual([expect.objectContaining({
      heroId: hero.id, stars: 1, poolCopies: 1,
    })]);
    expect(adventureShopRemainingCopies(claimed.state.shopPool, hero.id)).toBe(before - 1);
    expect(() => applyAdventureCommand(claimed.state, {
      commandId: "start-with-pending-hero",
      expectedRevision: 4,
      type: "START_ROUND",
    }, rules)).toThrow("ADVENTURE_PENDING_HERO_REWARD");
  });

  it("requires legal selections and rejects mismatched rounds", () => {
    // Round 3 is used here (rather than the default round 1) because round 1's
    // encounter grants only gold/shop_refresh, which produce zero reward
    // offers; an empty selections array is trivially valid against zero
    // offers and would not exercise this rejection path.
    const rewarded = recordWin(combatReady(3)).state;
    expect(() => claimAdventureRoundReward(rewarded, {
      commandId: "invalid-claim",
      expectedRevision: 4,
      type: "CLAIM_ROUND_REWARD",
      selections: [],
    }, rules, content)).toThrow("ADVENTURE_REWARD_SELECTION_REQUIRED");

    expect(() => recordAdventureCombatResult(combatReady(), {
      commandId: "wrong-round",
      expectedRevision: 3,
      type: "RECORD_COMBAT_RESULT",
      round: 2,
      winner: "player",
      survivingEnemyUnits: 0,
      resultHash: "wrong-round",
      finalTick: 10,
      reason: "elimination",
    }, rules, content)).toThrow("ADVENTURE_COMBAT_ROUND_MISMATCH");
  });
});
