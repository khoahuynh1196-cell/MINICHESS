import type { CompiledContentBundle } from "../content/types.js";
import { progressionState } from "../rules/progression.js";
import type { CompiledRuleset } from "../rules/types.js";
import { assertAdventureRoster } from "./roster.js";
import type { AdventureGameState } from "./state.js";
import type { AdventureHeroInstance } from "./types.js";

function safeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be a safe integer >= ${minimum}`);
}

function rosterHeroes(state: AdventureGameState): AdventureHeroInstance[] {
  return [...state.run.board, ...state.run.bench]
    .filter((hero): hero is AdventureHeroInstance => hero !== null);
}

export function assertAdventureGameState(
  state: AdventureGameState,
  content: CompiledContentBundle,
  rules: CompiledRuleset,
): void {
  if (state.seed.length === 0) throw new Error("Adventure game seed must not be empty");
  if (state.shopPool.seed !== state.seed) throw new Error("Adventure shop pool seed does not match the game seed");
  if (state.run.rulesetVersion !== rules.version) throw new Error("Adventure run ruleset version mismatch");
  if (state.run.contentVersion !== content.version) throw new Error("Adventure run content version mismatch");
  safeInteger(state.run.revision, "run.revision");
  safeInteger(state.refreshNumber, "refreshNumber");
  safeInteger(state.acquisitionCounter, "acquisitionCounter");
  safeInteger(state.run.gold, "run.gold");
  safeInteger(state.run.health, "run.health");
  safeInteger(state.run.round, "run.round", 1);
  safeInteger(state.run.freeRefreshes, "run.freeRefreshes");
  if (state.run.health > rules.adventure.initialHealth) throw new Error("Adventure health exceeds its initial maximum");
  if (state.run.round > rules.adventure.roundCount) throw new Error("Adventure round exceeds the configured run length");

  const progression = progressionState(rules, state.run.level, state.run.experience);
  assertAdventureRoster(rules, state.run, progression.boardCap);
  if (state.run.shop.length !== rules.shop.slotCount) throw new Error("Adventure shop length does not match rules");
  if (state.run.phase === "REWARD" && state.pendingReward === undefined) {
    throw new Error("Adventure reward phase requires a pending reward");
  }
  if (state.pendingReward !== undefined && state.run.phase !== "PLAYBACK" && state.run.phase !== "REWARD") {
    throw new Error("Adventure pending reward is only valid during PLAYBACK or REWARD");
  }
  if (state.pendingReward !== undefined) {
    if (state.pendingReward.round !== state.run.round) throw new Error("Adventure pending reward round mismatch");
    const offerIds = new Set<string>();
    for (const offer of state.pendingReward.offers) {
      if (offerIds.has(offer.id)) throw new Error(`Duplicate Adventure reward offer: ${offer.id}`);
      offerIds.add(offer.id);
      if (offer.options.length === 0) throw new Error(`Adventure reward offer ${offer.id} has no options`);
      if (new Set(offer.options.map((option) => option.id)).size !== offer.options.length) {
        throw new Error(`Adventure reward offer ${offer.id} has duplicate options`);
      }
    }
  }
  if (state.lastCombat !== undefined) {
    safeInteger(state.lastCombat.round, "lastCombat.round", 1);
    safeInteger(state.lastCombat.survivingEnemyUnits, "lastCombat.survivingEnemyUnits");
    safeInteger(state.lastCombat.finalTick, "lastCombat.finalTick");
    if (state.lastCombat.resultHash.length === 0) throw new Error("Adventure combat result hash is missing");
    if (state.lastCombat.round > state.run.round) throw new Error("Adventure combat result is ahead of the run round");
  }

  const ownedHeroes = [...rosterHeroes(state), ...state.run.rewardHeroes];
  const ownedInstanceIds = new Set<string>();
  let maximumAcquisitionOrder = 0;
  for (const hero of ownedHeroes) {
    if (ownedInstanceIds.has(hero.instanceId)) throw new Error(`Duplicate Adventure hero instance: ${hero.instanceId}`);
    ownedInstanceIds.add(hero.instanceId);
    maximumAcquisitionOrder = Math.max(maximumAcquisitionOrder, hero.acquisitionOrder);
    const definition = content.heroesById.get(hero.heroId);
    if (definition === undefined || definition.is_unique_hero) throw new Error(`Adventure hero definition is invalid: ${hero.heroId}`);
    if (hero.cost !== definition.cost) throw new Error(`Adventure hero cost mismatch: ${hero.heroId}`);
  }
  if (state.acquisitionCounter < maximumAcquisitionOrder) {
    throw new Error("Adventure acquisition counter is behind an owned hero");
  }

  const shopReservations = new Map<string, number>();
  for (const slot of state.run.shop) {
    if (slot === null) continue;
    const hero = content.heroesById.get(slot.heroId);
    if (hero === undefined || hero.is_unique_hero) throw new Error(`Adventure shop contains an invalid hero: ${slot.heroId}`);
    if (slot.cost !== hero.cost || slot.rarity !== hero.rarity) throw new Error(`Adventure shop metadata mismatch: ${slot.heroId}`);
    shopReservations.set(slot.heroId, (shopReservations.get(slot.heroId) ?? 0) + 1);
  }

  const ownedCopies = new Map<string, number>();
  for (const hero of ownedHeroes) ownedCopies.set(hero.heroId, (ownedCopies.get(hero.heroId) ?? 0) + hero.poolCopies);

  const expectedPoolHeroIds = [...content.heroesById.values()]
    .filter((hero) => !hero.is_unique_hero)
    .map((hero) => hero.id)
    .sort();
  const actualPoolHeroIds = Object.keys(state.shopPool.entries).sort();
  if (actualPoolHeroIds.join(",") !== expectedPoolHeroIds.join(",")) {
    throw new Error("Adventure shop pool hero set does not match content");
  }
  for (const heroId of expectedPoolHeroIds) {
    const definition = content.heroesById.get(heroId)!;
    const entry = state.shopPool.entries[heroId]!;
    const configuredTotal = rules.shop.copiesByRarity[definition.rarity];
    if (entry.heroId !== heroId || entry.cost !== definition.cost || entry.rarity !== definition.rarity) {
      throw new Error(`Adventure shop pool metadata mismatch: ${heroId}`);
    }
    if (entry.totalCopies !== configuredTotal) throw new Error(`Adventure shop pool total mismatch: ${heroId}`);
    safeInteger(entry.remainingCopies, `shopPool.${heroId}.remainingCopies`);
    if (entry.remainingCopies > entry.totalCopies) throw new Error(`Adventure shop pool overflow: ${heroId}`);
    const conserved = entry.remainingCopies
      + (shopReservations.get(heroId) ?? 0)
      + (ownedCopies.get(heroId) ?? 0);
    if (conserved !== entry.totalCopies) {
      throw new Error(`Adventure shop pool conservation failed: ${heroId}:${conserved}:${entry.totalCopies}`);
    }
  }

  for (const [commandId, receipt] of Object.entries(state.commandHistory)) {
    if (commandId.length === 0 || receipt.fingerprint.length === 0) throw new Error("Adventure command receipt is invalid");
    safeInteger(receipt.revision, `commandHistory.${commandId}.revision`, 1);
    if (receipt.revision > state.run.revision) throw new Error(`Adventure command receipt is ahead of state: ${commandId}`);
  }
}
