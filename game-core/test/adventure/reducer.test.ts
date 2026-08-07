import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  adventureShopRemainingCopies,
  applyAdventureCommand,
  compileContentBundle,
  compileRuleset,
  createAdventureGame,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function freshGame() {
  return createAdventureGame({ id: "run-domain", seed: "run-domain-seed", content, rules });
}

describe("pure Adventure command reducer", () => {
  it("creates a deterministic rules-sized Adventure state", () => {
    const first = freshGame();
    const second = freshGame();

    expect(first).toEqual(second);
    expect(first.run).toMatchObject({
      revision: 0,
      phase: "PREPARE",
      rulesetVersion: rules.version,
      contentVersion: content.version,
      round: 1,
      gold: 8,
      health: 30,
      level: 3,
      experience: 0,
      shopLocked: false,
      freeRefreshes: 0,
    });
    expect(first.run.board).toHaveLength(16);
    expect(first.run.bench).toHaveLength(8);
    expect(first.run.shop).toHaveLength(5);
  });

  it("applies a refresh once and replays the same command without charging twice", () => {
    const initial = freshGame();
    const command = { commandId: "refresh-1", expectedRevision: 0, type: "REFRESH_SHOP" as const };
    const applied = applyAdventureCommand(initial, command, rules);
    const replayed = applyAdventureCommand(applied.state, command, rules);

    expect(applied).toMatchObject({ revision: 1, replayed: false });
    expect(applied.state.run.gold).toBe(6);
    expect(applied.state.refreshNumber).toBe(1);
    expect(replayed).toEqual({ state: applied.state, revision: 1, replayed: true });
    expect(replayed.state.run.gold).toBe(6);
  });

  it("rejects command ID reuse with a different fingerprint and stale revisions", () => {
    const initial = freshGame();
    const applied = applyAdventureCommand(initial, {
      commandId: "lock-1", expectedRevision: 0, type: "LOCK_SHOP",
    }, rules);

    expect(() => applyAdventureCommand(applied.state, {
      commandId: "lock-1", expectedRevision: 1, type: "LOCK_SHOP",
    }, rules)).toThrow("ADVENTURE_COMMAND_ID_REUSED");
    expect(() => applyAdventureCommand(applied.state, {
      commandId: "xp-stale", expectedRevision: 0, type: "BUY_XP",
    }, rules)).toThrow("ADVENTURE_REVISION_CONFLICT");
  });

  it("locks the shop and blocks refresh until it is unlocked", () => {
    const locked = applyAdventureCommand(freshGame(), {
      commandId: "lock", expectedRevision: 0, type: "LOCK_SHOP",
    }, rules).state;

    expect(locked.run.shopLocked).toBe(true);
    expect(() => applyAdventureCommand(locked, {
      commandId: "refresh", expectedRevision: 1, type: "REFRESH_SHOP",
    }, rules)).toThrow("ADVENTURE_SHOP_LOCKED");
  });

  it("buys rules-driven experience", () => {
    const result = applyAdventureCommand(freshGame(), {
      commandId: "xp", expectedRevision: 0, type: "BUY_XP",
    }, rules);

    expect(result.state.run).toMatchObject({ revision: 1, gold: 4, level: 3, experience: 4 });
  });

  it("buys a reserved shop hero, moves it, and starts combat", () => {
    const initial = freshGame();
    const slot = initial.run.shop[0];
    if (slot === null || slot === undefined) throw new Error("Initial test shop is empty");
    const remainingBeforeBuy = adventureShopRemainingCopies(initial.shopPool, slot.heroId);
    const bought = applyAdventureCommand(initial, {
      commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
    }, rules).state;
    const instanceId = "hero:run-domain:buy";

    expect(bought.run.shop[0]).toBeNull();
    expect(bought.run.gold).toBe(initial.run.gold - slot.cost);
    expect(bought.run.bench[0]).toMatchObject({ instanceId, heroId: slot.heroId, stars: 1, poolCopies: 1 });
    expect(adventureShopRemainingCopies(bought.shopPool, slot.heroId)).toBe(remainingBeforeBuy);

    const moved = applyAdventureCommand(bought, {
      commandId: "move", expectedRevision: 1, type: "MOVE_HERO",
      heroInstanceId: instanceId, destination: { kind: "board", index: 0 },
    }, rules).state;
    expect(moved.run.board[0]?.instanceId).toBe(instanceId);
    expect(moved.run.bench[0]).toBeNull();

    const started = applyAdventureCommand(moved, {
      commandId: "start", expectedRevision: 2, type: "START_ROUND",
    }, rules).state;
    expect(started.run).toMatchObject({ revision: 3, phase: "COMBAT" });
    expect(() => applyAdventureCommand(started, {
      commandId: "xp-during-combat", expectedRevision: 3, type: "BUY_XP",
    }, rules)).toThrow("ADVENTURE_COMMAND_NOT_ALLOWED");
  });

  it("sells a purchased hero, returns its pool copies, and grants sale gold once", () => {
    const initial = freshGame();
    const slot = initial.run.shop[0];
    if (slot === null || slot === undefined) throw new Error("Initial test shop is empty");
    const bought = applyAdventureCommand(initial, {
      commandId: "buy", expectedRevision: 0, type: "BUY_SHOP_HERO", shopSlotIndex: 0,
    }, rules).state;
    const remainingAfterRoll = adventureShopRemainingCopies(bought.shopPool, slot.heroId);
    const sold = applyAdventureCommand(bought, {
      commandId: "sell", expectedRevision: 1, type: "SELL_HERO", heroInstanceId: "hero:run-domain:buy",
    }, rules);
    const replayed = applyAdventureCommand(sold.state, {
      commandId: "sell", expectedRevision: 1, type: "SELL_HERO", heroInstanceId: "hero:run-domain:buy",
    }, rules);

    expect(sold.state.run.bench.every((hero) => hero === null)).toBe(true);
    expect(sold.state.run.gold).toBe(initial.run.gold);
    expect(adventureShopRemainingCopies(sold.state.shopPool, slot.heroId)).toBe(remainingAfterRoll + 1);
    expect(replayed).toEqual({ state: sold.state, revision: 2, replayed: true });
  });

  it("requires at least one deployed hero before combat", () => {
    expect(() => applyAdventureCommand(freshGame(), {
      commandId: "start-empty", expectedRevision: 0, type: "START_ROUND",
    }, rules)).toThrow("ADVENTURE_BOARD_EMPTY");
  });
});
