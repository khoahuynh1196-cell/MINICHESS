import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AdventureSession,
  compileContentBundle,
  compileOfflineRelease,
  compileRuleset,
  createAdventureCombatPlayback,
} from "../game-core/dist/src/index.js";

function readJson(path) {
  return JSON.parse(readFileSync(resolve(process.cwd(), path), "utf8"));
}

const release = compileOfflineRelease(readJson("releases/offline-foundation-0.1.0/release.json"));
const content = compileContentBundle(readJson("content/alpha-0.3.0/bundle.json"));
const rules = compileRuleset(readJson("rules/production-0.1.0/ruleset.json"));

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

const store = new MemoryStore();
const session = new AdventureSession({
  release,
  rules,
  content,
  assetRevision: release.assets.revision,
  clientSchema: release.minimumClientSchema,
  store,
  combatEngine: {
    resolve({ snapshot }) {
      // This smoke exercises the run lifecycle only. Production combat is a
      // separately injected engine and is not claimed by this scripted outcome.
      const outcome = {
        round: snapshot.round,
        winner: "player",
        survivingEnemyUnits: 0,
        resultHash: `domain-smoke:${snapshot.snapshotHash}`,
        finalTick: 1,
        reason: "elimination",
      };
      const playback = createAdventureCombatPlayback(snapshot, [
        { sequence: 0, tick: 0, type: "COMBAT_STARTED", payload: {} },
        { sequence: 1, tick: outcome.finalTick, type: "COMBAT_ENDED", payload: { winner: outcome.winner } },
      ]);
      return { outcome, playback };
    },
  },
});

await session.start({ id: "offline-domain-smoke", seed: "offline-domain-smoke-seed" });
let commandCounter = 0;
const commandId = (name) => `smoke:${String(++commandCounter).padStart(3, "0")}:${name}`;

async function ensureDeployedHero() {
  if (session.state.run.board.some((hero) => hero !== null)) return;
  let slotIndex = session.state.run.shop.findIndex((slot) => slot !== null && slot.cost <= session.state.run.gold);
  if (slotIndex < 0) throw new Error("DOMAIN_SMOKE_NO_AFFORDABLE_HERO");
  await session.dispatch({
    commandId: commandId("buy"),
    expectedRevision: session.state.run.revision,
    type: "BUY_SHOP_HERO",
    shopSlotIndex: slotIndex,
  });
  const hero = session.state.run.bench.find((candidate) => candidate !== null);
  if (hero === null || hero === undefined) throw new Error("DOMAIN_SMOKE_PURCHASE_MISSING");
  await session.dispatch({
    commandId: commandId("deploy"),
    expectedRevision: session.state.run.revision,
    type: "MOVE_HERO",
    heroInstanceId: hero.instanceId,
    destination: { kind: "board", index: session.state.run.board.length - 1 },
  });
}

async function makeBenchSpace() {
  if (session.state.run.bench.some((hero) => hero === null)) return;
  const sellable = session.state.run.bench.find((hero) => hero !== null);
  if (sellable === null || sellable === undefined) throw new Error("DOMAIN_SMOKE_BENCH_DEADLOCK");
  await session.dispatch({
    commandId: commandId("sell-for-reward-space"),
    expectedRevision: session.state.run.revision,
    type: "SELL_HERO",
    heroInstanceId: sellable.instanceId,
  });
}

async function claimQueuedHeroes() {
  while (session.state.run.rewardHeroes.length > 0) {
    await makeBenchSpace();
    const reward = session.state.run.rewardHeroes[0];
    await session.dispatch({
      commandId: commandId("claim-hero"),
      expectedRevision: session.state.run.revision,
      type: "CLAIM_REWARD_HERO",
      heroInstanceId: reward.instanceId,
    });
  }
}

for (let expectedRound = 1; expectedRound <= rules.adventure.roundCount; expectedRound += 1) {
  if (session.state.run.round !== expectedRound || session.state.run.phase !== "PREPARE") {
    throw new Error(`DOMAIN_SMOKE_BAD_PREPARE_STATE:${expectedRound}`);
  }
  await claimQueuedHeroes();
  await ensureDeployedHero();
  await session.dispatch({
    commandId: commandId("start-round"),
    expectedRevision: session.state.run.revision,
    type: "START_ROUND",
  });
  await session.resolveCombat({
    commandId: commandId("resolve-round"),
    expectedRevision: session.state.run.revision,
    type: "RESOLVE_COMBAT",
  });
  if (session.state.run.phase !== "PLAYBACK") throw new Error(`DOMAIN_SMOKE_NOT_IN_PLAYBACK:${expectedRound}`);
  await session.ackPlaybackComplete({
    commandId: commandId("ack-playback"),
    expectedRevision: session.state.run.revision,
    type: "ACK_PLAYBACK_COMPLETE",
  });
  const reward = session.state.pendingReward;
  if (reward === undefined) throw new Error(`DOMAIN_SMOKE_REWARD_MISSING:${expectedRound}`);
  await session.claimReward({
    commandId: commandId("claim-round"),
    expectedRevision: session.state.run.revision,
    type: "CLAIM_ROUND_REWARD",
    selections: reward.offers.map((offer) => ({
      offerId: offer.id,
      optionId: offer.options[0].id,
    })),
  });
  if (expectedRound < rules.adventure.roundCount && session.state.run.phase !== "PREPARE") {
    throw new Error(`DOMAIN_SMOKE_DID_NOT_RETURN_TO_PREPARE:${expectedRound}`);
  }
}

if (session.state.run.phase !== "COMPLETE" || session.state.run.round !== rules.adventure.roundCount) {
  throw new Error("DOMAIN_SMOKE_DID_NOT_COMPLETE");
}

const restored = new AdventureSession({
  release,
  rules,
  content,
  assetRevision: release.assets.revision,
  clientSchema: release.minimumClientSchema,
  store,
  combatEngine: { resolve() { throw new Error("RESTORED_COMPLETE_RUN_MUST_NOT_SIMULATE"); } },
});
await restored.restore();
if (restored.state.run.phase !== "COMPLETE" || restored.state.run.revision !== session.state.run.revision) {
  throw new Error("DOMAIN_SMOKE_RESTORE_MISMATCH");
}

console.log(JSON.stringify({
  status: "PASS",
  scope: "Adventure domain lifecycle with scripted combat outcomes",
  rounds: restored.state.run.round,
  revision: restored.state.run.revision,
  finalGold: restored.state.run.gold,
  items: restored.state.run.items.length,
  rewardHeroesPending: restored.state.run.rewardHeroes.length,
  saves: store.saves,
  rulesetVersion: restored.state.run.rulesetVersion,
  contentVersion: restored.state.run.contentVersion,
}));
