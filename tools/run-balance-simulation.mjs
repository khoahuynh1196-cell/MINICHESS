import { readFileSync, writeFileSync } from "node:fs";
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

/**
 * Deterministic balance simulation (Mission 9). Plays the same scripted
 * greedy economy tools/run-adventure-domain-smoke.mjs uses across many
 * seeds through the real production combat kernel, and aggregates:
 *   - win rate per round (a proxy for encounter difficulty scaling)
 *   - deployment frequency per hero (a "pick rate" proxy, biased by the
 *     scripted purchasing heuristic -- see caveats in the report)
 *   - damage/heal/shield dealt per hero, attributed from real playback
 *     events via the board's instanceId -> heroId mapping at combat time
 *
 * This is not a substitute for real playtesting. It measures what THIS
 * kernel and THIS scripted economy produce, nothing about human player
 * behavior or preference.
 */

const SAMPLE_SIZE = Number(process.env.BALANCE_SAMPLE_SIZE ?? 30);
const DAMAGE_HERO_IDS = new Set(["H03", "H07", "H09", "H12", "H13", "H16", "H18", "H19"]);

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

const release = compileOfflineRelease(readJson("releases/offline-foundation-0.1.0/release.json"));
const content = compileContentBundle(readJson("content/alpha-0.3.0/bundle.json"));
const rules = compileRuleset(readJson("rules/production-0.1.0/ruleset.json"));

class MemoryStore {
  encoded;
  load() { return this.encoded; }
  save(encoded) { this.encoded = encoded; }
  clear() { this.encoded = undefined; }
}

function newSession(store, onCombatResolved) {
  return new AdventureSession({
    release, rules, content, assetRevision: release.assets.revision, clientSchema: release.minimumClientSchema,
    store,
    combatEngine: {
      resolve(request) {
        const result = runProductionCombat(request);
        onCombatResolved(request.snapshot, result);
        return result;
      },
    },
  });
}

/** Plays one scripted run and returns per-round stats. Mirrors the
 * economy heuristic in run-adventure-domain-smoke.mjs exactly, so the
 * balance numbers reflect the same play pattern that script proves works. */
async function playOneRun(seed) {
  const store = new MemoryStore();
  const roundStats = [];
  let currentSnapshot = null;
  const session = newSession(store, (snapshot, result) => {
    currentSnapshot = snapshot;
    const damageByHero = new Map();
    const healByHero = new Map();
    const shieldByHero = new Map();
    const instanceToHero = new Map(snapshot.playerUnits.map((unit) => [unit.unitId, unit.heroId]));
    const add = (map, unitId, amount) => {
      const heroId = instanceToHero.get(unitId);
      if (heroId === undefined || amount <= 0) return;
      map.set(heroId, (map.get(heroId) ?? 0) + amount);
    };
    for (const event of result.playback.events) {
      if (event.type === "DAMAGE_APPLIED") add(damageByHero, event.sourceUnitId, Number(event.payload.amount ?? 0));
      if (event.type === "HEAL_APPLIED") add(healByHero, event.sourceUnitId, Number(event.payload.amount ?? 0));
      if (event.type === "SHIELD_APPLIED") add(shieldByHero, event.sourceUnitId, Number(event.payload.amount ?? 0));
    }
    roundStats.push({
      round: snapshot.round,
      winner: result.outcome.winner,
      reason: result.outcome.reason,
      finalTick: result.outcome.finalTick,
      deployedHeroIds: snapshot.playerUnits.map((unit) => unit.heroId),
      damageByHero: Object.fromEntries(damageByHero),
      healByHero: Object.fromEntries(healByHero),
      shieldByHero: Object.fromEntries(shieldByHero),
    });
  });
  await session.start({ id: `balance-${seed}`, seed });
  let commandCounter = 0;
  const commandId = (name) => `balance:${seed}:${String(++commandCounter).padStart(3, "0")}:${name}`;

  function boardCap() { return progressionState(rules, session.state.run.level, session.state.run.experience).boardCap; }
  function ownedHeroCount() {
    return session.state.run.board.filter((hero) => hero !== null).length + session.state.run.bench.filter((hero) => hero !== null).length;
  }
  async function buyAffordableHeroes() {
    for (;;) {
      if (ownedHeroCount() >= boardCap()) break;
      const shop = session.state.run.shop;
      let slotIndex = shop.findIndex((slot) => slot !== null && slot.cost <= session.state.run.gold && DAMAGE_HERO_IDS.has(slot.heroId));
      if (slotIndex < 0) slotIndex = shop.findIndex((slot) => slot !== null && slot.cost <= session.state.run.gold);
      if (slotIndex < 0) break;
      await session.dispatch({ commandId: commandId("buy"), expectedRevision: session.state.run.revision, type: "BUY_SHOP_HERO", shopSlotIndex: slotIndex });
    }
  }
  async function deployBenchUpToCap() {
    for (;;) {
      if (deployedHeroCount(session.state.run) >= boardCap()) break;
      const emptyBoardIndex = session.state.run.board.findIndex((hero) => hero === null);
      const benchHero = session.state.run.bench.find((hero) => hero !== null);
      if (emptyBoardIndex < 0 || benchHero === undefined) break;
      await session.dispatch({ commandId: commandId("deploy"), expectedRevision: session.state.run.revision, type: "MOVE_HERO", heroInstanceId: benchHero.instanceId, destination: { kind: "board", index: emptyBoardIndex } });
    }
  }
  async function spendRemainingGoldOnXp() {
    while (session.state.run.gold >= rules.progression.xpPurchaseCost && session.state.run.level < rules.progression.maxLevel) {
      await session.dispatch({ commandId: commandId("xp"), expectedRevision: session.state.run.revision, type: "BUY_XP" });
    }
  }
  async function claimQueuedHeroes() {
    while (session.state.run.rewardHeroes.length > 0) {
      if (session.state.run.bench.every((hero) => hero !== null)) {
        const sellable = [...session.state.run.bench].reverse().find((hero) => hero !== null);
        await session.dispatch({ commandId: commandId("sell"), expectedRevision: session.state.run.revision, type: "SELL_HERO", heroInstanceId: sellable.instanceId });
      }
      const reward = session.state.run.rewardHeroes[0];
      await session.dispatch({ commandId: commandId("claim-hero"), expectedRevision: session.state.run.revision, type: "CLAIM_REWARD_HERO", heroInstanceId: reward.instanceId });
    }
  }

  while (session.state.run.phase === "PREPARE") {
    await claimQueuedHeroes();
    await buyAffordableHeroes();
    await deployBenchUpToCap();
    await spendRemainingGoldOnXp();
    if (session.state.run.board.every((hero) => hero === null)) break;

    await session.dispatch({ commandId: commandId("start-round"), expectedRevision: session.state.run.revision, type: "START_ROUND" });
    await session.resolveCombat({ commandId: commandId("resolve-round"), expectedRevision: session.state.run.revision, type: "RESOLVE_COMBAT" });
    await session.ackPlaybackComplete({ commandId: commandId("ack-playback"), expectedRevision: session.state.run.revision, type: "ACK_PLAYBACK_COMPLETE" });
    if (session.state.run.phase === "REWARD") {
      const reward = session.state.pendingReward;
      const selections = reward.offers.map((offer) => ({ offerId: offer.id, optionId: offer.options[0].id }));
      await session.claimReward({ commandId: commandId("claim-round"), expectedRevision: session.state.run.revision, type: "CLAIM_ROUND_REWARD", selections });
    }
  }

  return { seed, finalRound: session.state.run.round, finalHealth: session.state.run.health, roundStats };
}

function summarize(runs) {
  const perRound = new Map();
  const damageTotals = new Map();
  const healTotals = new Map();
  const shieldTotals = new Map();
  const deployCounts = new Map();

  for (const run of runs) {
    for (const round of run.roundStats) {
      const bucket = perRound.get(round.round) ?? { wins: 0, losses: 0, finalTicks: [] };
      if (round.winner === "player") bucket.wins += 1; else bucket.losses += 1;
      bucket.finalTicks.push(round.finalTick);
      perRound.set(round.round, bucket);

      for (const heroId of round.deployedHeroIds) deployCounts.set(heroId, (deployCounts.get(heroId) ?? 0) + 1);
      for (const [heroId, amount] of Object.entries(round.damageByHero)) damageTotals.set(heroId, (damageTotals.get(heroId) ?? 0) + amount);
      for (const [heroId, amount] of Object.entries(round.healByHero)) healTotals.set(heroId, (healTotals.get(heroId) ?? 0) + amount);
      for (const [heroId, amount] of Object.entries(round.shieldByHero)) shieldTotals.set(heroId, (shieldTotals.get(heroId) ?? 0) + amount);
    }
  }

  const roundSummary = [...perRound.entries()].sort((a, b) => a[0] - b[0]).map(([round, bucket]) => ({
    round,
    winRate: Number((bucket.wins / (bucket.wins + bucket.losses)).toFixed(3)),
    samples: bucket.wins + bucket.losses,
    meanFinalTick: Math.round(bucket.finalTicks.reduce((a, b) => a + b, 0) / bucket.finalTicks.length),
  }));

  const heroSummary = [...content.heroesById.keys()].filter((id) => !content.heroesById.get(id).is_unique_hero).sort().map((heroId) => ({
    heroId,
    deployedRounds: deployCounts.get(heroId) ?? 0,
    totalDamage: damageTotals.get(heroId) ?? 0,
    totalHeal: healTotals.get(heroId) ?? 0,
    totalShield: shieldTotals.get(heroId) ?? 0,
  }));

  return { roundSummary, heroSummary };
}

const seeds = Array.from({ length: SAMPLE_SIZE }, (_, index) => `balance-seed-${index + 1}`);
const runs = [];
for (const seed of seeds) runs.push(await playOneRun(seed));
const { roundSummary, heroSummary } = summarize(runs);

const report = {
  status: "PASS",
  scope: "Deterministic balance simulation via the real production 4x8 combat engine",
  sampleSize: SAMPLE_SIZE,
  caveats: [
    "Sample size is small (see sampleSize above); treat every number here as directional, not conclusive -- do not overfit balance decisions to it.",
    "\"Deployment frequency\" reflects tools/run-adventure-domain-smoke.mjs's scripted purchasing heuristic (prefer offense-tagged heroes, buy up to board cap, then spend on XP), not real player preference.",
    "Damage/heal/shield totals are summed across every simulated round a hero was deployed in, not normalized per-round or per-deployment -- a hero deployed more often will show a higher raw total even at equal per-fight output.",
    "Numeric interpretation of CombatEffect.baseValue (see game-core/src/simulation/production-kernel.ts) is this branch's own inferred convention, not confirmed game-design intent; balance conclusions inherit that uncertainty.",
    "Win rate reflects THIS kernel's current numeric interpretation and THIS scripted economy, matching Mission 5's own finding that a generic greedy strategy does not clear all 8 rounds under current balance.",
  ],
  roundSummary,
  heroSummary,
  rulesetVersion: rules.version,
  contentVersion: content.version,
};

writeFileSync(resolve(process.cwd(), "docs/evidence/balance-simulation-report.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ status: "PASS", sampleSize: SAMPLE_SIZE, roundSummary, reportPath: "docs/evidence/balance-simulation-report.json" }));
