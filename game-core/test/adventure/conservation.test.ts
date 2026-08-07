import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  applyAdventureCommand,
  assertAdventureGameState,
  claimAdventureRoundReward,
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

function nextRandom(state: number): number {
  return (Math.imul(state, 1664525) + 1013904223) >>> 0;
}

function applyIfLegal(state: AdventureGameState, command: Parameters<typeof applyAdventureCommand>[1]): AdventureGameState {
  try {
    return applyAdventureCommand(state, command, rules).state;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isExpectedRejection = message.startsWith("ADVENTURE_")
      || message.includes("capacity")
      || message.includes("destination")
      || message.includes("is empty")
      || message.includes("not found");
    if (!isExpectedRejection) throw error;
    return state;
  }
}

describe("Adventure conservation stress", () => {
  it("preserves all state invariants through 500 deterministic prepare mutations", () => {
    let state = createAdventureGame({ id: "stress-run", seed: "stress-seed", content, rules });
    let random = 1;
    let commandNumber = 0;

    for (let step = 0; step < 500; step += 1) {
      random = nextRandom(random);
      commandNumber += 1;
      const commandId = `stress-${commandNumber}`;
      const revision = state.run.revision;
      const operation = random % 6;

      if (operation === 0) {
        state = applyIfLegal(state, { commandId, expectedRevision: revision, type: "REFRESH_SHOP" });
      } else if (operation === 1) {
        const slotIndex = (random >>> 8) % rules.shop.slotCount;
        state = applyIfLegal(state, { commandId, expectedRevision: revision, type: "BUY_SHOP_HERO", shopSlotIndex: slotIndex });
      } else if (operation === 2) {
        const hero = [...state.run.bench, ...state.run.board].find((candidate) => candidate !== null);
        if (hero !== undefined && hero !== null) {
          const localIndex = (random >>> 8) % state.run.board.length;
          state = applyIfLegal(state, {
            commandId,
            expectedRevision: revision,
            type: "MOVE_HERO",
            heroInstanceId: hero.instanceId,
            destination: { kind: "board", index: localIndex },
          });
        }
      } else if (operation === 3) {
        const hero = [...state.run.bench, ...state.run.board].find((candidate) => candidate !== null);
        if (hero !== undefined && hero !== null) {
          state = applyIfLegal(state, {
            commandId,
            expectedRevision: revision,
            type: "SELL_HERO",
            heroInstanceId: hero.instanceId,
          });
        }
      } else if (operation === 4) {
        state = applyIfLegal(state, { commandId, expectedRevision: revision, type: "LOCK_SHOP" });
      } else {
        state = applyIfLegal(state, { commandId, expectedRevision: revision, type: "BUY_XP" });
      }

      expect(() => assertAdventureGameState(state, content, rules)).not.toThrow();
    }
  });

  it("preserves conservation across combat, reward claim, and the next-round shop", () => {
    let state = createAdventureGame({ id: "round-stress", seed: "round-stress-seed", content, rules });
    state = applyAdventureCommand(state, {
      commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
    }, rules).state;
    state = applyAdventureCommand(state, {
      commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
      heroInstanceId: "hero:round-stress:buy", destination: { kind: "board", index: 15 },
    }, rules).state;
    state = applyAdventureCommand(state, {
      commandId: "start", expectedRevision: 2, type: "START_ROUND",
    }, rules).state;
    state = recordAdventureCombatResult(state, {
      commandId: "resolve", expectedRevision: 3, type: "RECORD_COMBAT_RESULT",
      round: 1,
      winner: "player",
      survivingEnemyUnits: 0,
      resultHash: "stress-result",
      finalTick: 100,
      reason: "elimination",
    }, rules, content).state;
    const selections = state.pendingReward!.offers.map((offer) => ({
      offerId: offer.id,
      optionId: offer.options[0]!.id,
    }));
    state = claimAdventureRoundReward(state, {
      commandId: "claim", expectedRevision: 4, type: "CLAIM_ROUND_REWARD", selections,
    }, rules, content).state;

    expect(state.run).toMatchObject({ phase: "PREPARE", round: 2, revision: 5 });
    expect(() => assertAdventureGameState(state, content, rules)).not.toThrow();
  });
});
