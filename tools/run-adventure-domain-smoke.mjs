import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AdventureSession,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
  deployedHeroCount,
  progressionState,
} from "../game-core/dist/src/index.js";
import { runProductionCombat } from "../game-core/dist/src/simulation/production-kernel.js";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

const release = compileOfflineRelease(readJson("releases/offline-foundation-0.1.0/release.json"));
const content = compileContentBundle(readJson("content/alpha-0.3.0/bundle.json"));
const rules = compileRuleset(readJson("rules/production-0.1.0/ruleset.json"));

// Heroes whose signature skill is offense-oriented (deal_damage, stun,
// apply_dot, knockback). A scripted economy that never buys any offense
// starves DPS entirely, since roughly half the roster is pure
// support/utility (heal/shield/buff/dash/summon).
const DAMAGE_HERO_IDS = new Set(["H03", "H07", "H09", "H12", "H13", "H16", "H18", "H19"]);

class MemoryStore {
  encoded;
  saves = 0;

  load() {
    return this.encoded;
  }

  save(encoded) {
    this.encoded = encoded;
    this.saves += 1;
  }

  clear() {
    this.encoded = undefined;
  }
}

function newSession(store) {
  return new AdventureSession({
    release,
    rules,
    content,
    assetRevision: release.assets.revision,
    clientSchema: release.minimumClientSchema,
    store,
    combatEngine: { resolve: (request) => runProductionCombat(request) },
  });
}

/**
 * Plays one complete Adventure run using only deterministic, greedy
 * scripted decisions through the real production combat engine, exercising
 * buying, refreshing, XP, board deployment, star merges, item equipping,
 * the hero-reward queue, the round-4 Unique 1-of-3 selection, combat
 * playback ACK, reward claiming, and a mid-run save/restore.
 *
 * This does not guarantee a full 8-round victory: with the kernel's
 * current numeric interpretation (documented in
 * game-core/src/simulation/production-kernel.ts), a generic greedy
 * economy does not reliably out-scale the encounter's stat-multiplier
 * curve past round 5-6. Tuning a strategy (or the content) to guarantee a
 * full clear is a balance exercise for Mission 9, not an architecture
 * concern for this mission. What this proves is that the domain lifecycle
 * correctly drives real, undoctored combat round after round, through
 * both wins and losses, until the run legitimately completes.
 */
async function playAdventure(seed) {
  const store = new MemoryStore();
  const session = newSession(store);
  await session.start({ id: `offline-domain-smoke-${seed}`, seed });
  let commandCounter = 0;
  const commandId = (name) => `smoke:${seed}:${String(++commandCounter).padStart(3, "0")}:${name}`;
  const roundOutcomes = [];

  function boardCap() {
    return progressionState(rules, session.state.run.level, session.state.run.experience).boardCap;
  }

  function ownedHeroCount() {
    return session.state.run.board.filter((hero) => hero !== null).length
      + session.state.run.bench.filter((hero) => hero !== null).length;
  }

  async function refreshShopIfAffordable() {
    const usesFree = session.state.run.freeRefreshes > 0;
    if (!usesFree && session.state.run.gold < rules.shop.refreshCost) return;
    await session.dispatch({ commandId: commandId("refresh"), expectedRevision: session.state.run.revision, type: "REFRESH_SHOP" });
  }

  async function buyAffordableHeroes() {
    for (;;) {
      if (ownedHeroCount() >= boardCap()) break;
      const shop = session.state.run.shop;
      let slotIndex = shop.findIndex((slot) => slot !== null && slot.cost <= session.state.run.gold && DAMAGE_HERO_IDS.has(slot.heroId));
      if (slotIndex < 0) slotIndex = shop.findIndex((slot) => slot !== null && slot.cost <= session.state.run.gold);
      if (slotIndex < 0) break;
      await session.dispatch({
        commandId: commandId("buy"), expectedRevision: session.state.run.revision,
        type: "BUY_SHOP_HERO", shopSlotIndex: slotIndex,
      });
    }
  }

  async function deployBenchUpToCap() {
    for (;;) {
      if (deployedHeroCount(session.state.run) >= boardCap()) break;
      const emptyBoardIndex = session.state.run.board.findIndex((hero) => hero === null);
      const benchHero = session.state.run.bench.find((hero) => hero !== null);
      if (emptyBoardIndex < 0 || benchHero === undefined) break;
      await session.dispatch({
        commandId: commandId("deploy"), expectedRevision: session.state.run.revision,
        type: "MOVE_HERO", heroInstanceId: benchHero.instanceId, destination: { kind: "board", index: emptyBoardIndex },
      });
    }
  }

  async function spendRemainingGoldOnXp() {
    while (session.state.run.gold >= rules.progression.xpPurchaseCost && session.state.run.level < rules.progression.maxLevel) {
      await session.dispatch({ commandId: commandId("xp"), expectedRevision: session.state.run.revision, type: "BUY_XP" });
    }
  }

  async function makeBenchSpaceForRewardHero() {
    if (session.state.run.bench.some((hero) => hero === null)) return;
    const sellable = [...session.state.run.bench].reverse().find((hero) => hero !== null);
    if (sellable === undefined) throw new Error("DOMAIN_SMOKE_BENCH_DEADLOCK");
    await session.dispatch({
      commandId: commandId("sell-for-reward-space"), expectedRevision: session.state.run.revision,
      type: "SELL_HERO", heroInstanceId: sellable.instanceId,
    });
  }

  async function claimQueuedHeroes() {
    while (session.state.run.rewardHeroes.length > 0) {
      await makeBenchSpaceForRewardHero();
      const reward = session.state.run.rewardHeroes[0];
      await session.dispatch({
        commandId: commandId("claim-hero"), expectedRevision: session.state.run.revision,
        type: "CLAIM_REWARD_HERO", heroInstanceId: reward.instanceId,
      });
    }
  }

  async function equipUnassignedItems() {
    for (;;) {
      const item = session.state.run.items.find((candidate) => candidate.equippedHeroInstanceId === undefined);
      const hero = session.state.run.board.find((candidate) => candidate !== null
        && session.state.run.items.filter((owned) => owned.equippedHeroInstanceId === candidate.instanceId).length < 2);
      if (item === undefined || hero === undefined) break;
      await session.dispatch({
        commandId: commandId("equip"), expectedRevision: session.state.run.revision,
        type: "EQUIP_ITEM", itemInstanceId: item.instanceId, heroInstanceId: hero.instanceId,
      });
    }
  }

  while (session.state.run.phase === "PREPARE") {
    const expectedRound = session.state.run.round;
    await claimQueuedHeroes();
    if (ownedHeroCount() === 0) await buyAffordableHeroes();
    await spendRemainingGoldOnXp();
    await refreshShopIfAffordable();
    await buyAffordableHeroes();
    await deployBenchUpToCap();
    await equipUnassignedItems();
    if (session.state.run.board.every((hero) => hero === null)) throw new Error(`DOMAIN_SMOKE_NO_AFFORDABLE_HERO:${expectedRound}`);

    await session.dispatch({ commandId: commandId("start-round"), expectedRevision: session.state.run.revision, type: "START_ROUND" });
    await session.resolveCombat({ commandId: commandId("resolve-round"), expectedRevision: session.state.run.revision, type: "RESOLVE_COMBAT" });
    if (session.state.run.phase !== "PLAYBACK") throw new Error(`DOMAIN_SMOKE_NOT_IN_PLAYBACK:${expectedRound}`);
    roundOutcomes.push({ round: expectedRound, winner: session.state.lastCombat.winner, reason: session.state.lastCombat.reason });

    await session.ackPlaybackComplete({ commandId: commandId("ack-playback"), expectedRevision: session.state.run.revision, type: "ACK_PLAYBACK_COMPLETE" });

    if (expectedRound === 4 && session.state.run.phase === "REWARD") {
      // Prove save/restore works mid-run, not only after the run completes.
      const midRunSession = newSession(store);
      const midRunRestored = await midRunSession.restore();
      if (midRunRestored === undefined || midRunRestored.run.phase !== "REWARD" || midRunRestored.run.round !== 4) {
        throw new Error("DOMAIN_SMOKE_MID_RUN_RESTORE_MISMATCH");
      }
    }

    if (session.state.run.phase === "REWARD") {
      const reward = session.state.pendingReward;
      await session.claimReward({
        commandId: commandId("claim-round"), expectedRevision: session.state.run.revision, type: "CLAIM_ROUND_REWARD",
        selections: reward.offers.map((offer) => ({ offerId: offer.id, optionId: offer.options[0].id })),
      });
    }
  }

  if (session.state.run.phase !== "COMPLETE") throw new Error("DOMAIN_SMOKE_DID_NOT_COMPLETE");

  const restoredForFinalCheck = new AdventureSession({
    release, rules, content, assetRevision: release.assets.revision, clientSchema: release.minimumClientSchema,
    store, combatEngine: { resolve() { throw new Error("RESTORED_COMPLETE_RUN_MUST_NOT_SIMULATE"); } },
  });
  await restoredForFinalCheck.restore();
  if (restoredForFinalCheck.state.run.phase !== "COMPLETE" || restoredForFinalCheck.state.run.revision !== session.state.run.revision) {
    throw new Error("DOMAIN_SMOKE_RESTORE_MISMATCH");
  }

  return { session, store, finalState: restoredForFinalCheck.state, roundOutcomes };
}

/** Plays a deliberately under-invested run to prove the deterministic defeat path. */
async function playToDefeat(seed) {
  const store = new MemoryStore();
  const session = newSession(store);
  await session.start({ id: `offline-domain-smoke-defeat-${seed}`, seed });
  let commandCounter = 0;
  const commandId = (name) => `smoke:defeat:${seed}:${String(++commandCounter).padStart(3, "0")}:${name}`;

  // Deploy exactly one hero once and never invest again: gold accumulates
  // unused while the encounter stat multiplier climbs every round, so this
  // team is guaranteed to eventually lose without needing simulated
  // randomness to decide the outcome.
  const slotIndex = session.state.run.shop.findIndex((slot) => slot !== null);
  await session.dispatch({ commandId: commandId("buy"), expectedRevision: session.state.run.revision, type: "BUY_SHOP_HERO", shopSlotIndex: slotIndex });
  const hero = session.state.run.bench.find((candidate) => candidate !== null);
  await session.dispatch({
    commandId: commandId("deploy"), expectedRevision: session.state.run.revision,
    type: "MOVE_HERO", heroInstanceId: hero.instanceId, destination: { kind: "board", index: 0 },
  });

  while (session.state.run.health > 0 && session.state.run.phase !== "COMPLETE") {
    await session.dispatch({ commandId: commandId("start-round"), expectedRevision: session.state.run.revision, type: "START_ROUND" });
    await session.resolveCombat({ commandId: commandId("resolve-round"), expectedRevision: session.state.run.revision, type: "RESOLVE_COMBAT" });
    await session.ackPlaybackComplete({ commandId: commandId("ack-playback"), expectedRevision: session.state.run.revision, type: "ACK_PLAYBACK_COMPLETE" });
    if (session.state.run.phase === "REWARD") {
      const reward = session.state.pendingReward;
      await session.claimReward({
        commandId: commandId("claim-round"), expectedRevision: session.state.run.revision, type: "CLAIM_ROUND_REWARD",
        selections: reward.offers.map((offer) => ({ offerId: offer.id, optionId: offer.options[0].id })),
      });
    }
  }

  if (session.state.run.health !== 0 || session.state.run.phase !== "COMPLETE") {
    throw new Error(`DOMAIN_SMOKE_DEFEAT_PATH_DID_NOT_LOSE:health=${session.state.run.health}:phase=${session.state.run.phase}`);
  }
  if (session.state.pendingReward !== undefined) throw new Error("DOMAIN_SMOKE_DEFEAT_PATH_HAS_REWARD");
  return { session, store };
}

const SEED = "offline-domain-smoke-seed";
const first = await playAdventure(SEED);
const second = await playAdventure(SEED);

if (first.finalState.run.revision !== second.finalState.run.revision
  || JSON.stringify(first.finalState) !== JSON.stringify(second.finalState)
  || JSON.stringify(first.roundOutcomes) !== JSON.stringify(second.roundOutcomes)) {
  throw new Error("DOMAIN_SMOKE_NOT_DETERMINISTIC_ACROSS_IDENTICAL_SEEDS");
}

const defeat = await playToDefeat("offline-domain-smoke-defeat-seed");

console.log(JSON.stringify({
  status: "PASS",
  scope: "Adventure domain lifecycle via the real production 4x8 combat engine",
  run: {
    roundsPlayed: first.roundOutcomes.length,
    roundOutcomes: first.roundOutcomes,
    finalRound: first.finalState.run.round,
    finalHealth: first.finalState.run.health,
    finalLevel: first.finalState.run.level,
    revision: first.finalState.run.revision,
    items: first.finalState.run.items.length,
    saves: first.store.saves,
    deterministicAcrossRepeatedRuns: true,
  },
  defeatPath: {
    finalHealth: defeat.session.state.run.health,
    finalRound: defeat.session.state.run.round,
    phase: defeat.session.state.run.phase,
  },
  rulesetVersion: first.finalState.run.rulesetVersion,
  contentVersion: first.finalState.run.contentVersion,
}));
