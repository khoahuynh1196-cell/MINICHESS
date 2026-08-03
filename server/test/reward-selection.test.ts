import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("deterministic round reward selection", () => {
  it("derives replay-stable R3 item choices and R5 supplemental payouts from compiled content", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const selection = await import("../src/application/reward-selection.js").catch(() => undefined) as undefined | {
      buildRoundRewardPlan(input: { runSeed: string; round: number; content: unknown }): {
        supplementalGold: number;
        freeRefreshes: number;
        offers: readonly { id: string; kind: string; options: readonly { id: string; kind: string }[] }[];
      };
    };
    expect(selection).toBeDefined();
    if (selection === undefined) return;
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));

    const thirdRound = selection.buildRoundRewardPlan({ runSeed: "000102030405060708090a0b0c0d0e0f", round: 3, content });
    const thirdRoundReplay = selection.buildRoundRewardPlan({ runSeed: "000102030405060708090a0b0c0d0e0f", round: 3, content });
    const fifthRound = selection.buildRoundRewardPlan({ runSeed: "000102030405060708090a0b0c0d0e0f", round: 5, content });

    expect(thirdRound).toEqual(thirdRoundReplay);
    expect(thirdRound).toMatchObject({
      supplementalGold: 0,
      freeRefreshes: 0,
      offers: [expect.objectContaining({ id: "reward:3:normal_item_choice:0", kind: "normal_item_choice" })],
    });
    expect(thirdRound.offers[0]?.options).toHaveLength(3);
    expect(thirdRound.offers[0]?.options.every((option) => option.kind === "normal_item" && /^I\d{2}$/.test(option.id))).toBe(true);
    expect(fifthRound).toMatchObject({ supplementalGold: 5, freeRefreshes: 1, offers: [] });
  });

  it("persists the content-derived offer on a surviving resolved run", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const lifecycle = await import("../src/application/round-lifecycle.js") as {
      attachContentRoundRewards?: (run: unknown, content: unknown) => { roundRewardPlan?: { round: number; offers: readonly { kind: string }[] } };
    };
    expect(lifecycle.attachContentRoundRewards).toBeDefined();
    if (lifecycle.attachContentRoundRewards === undefined) return;
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const resolvedRun = {
      id: "run-reward-offer", tenantId: "tenant-a", contentVersion: "alpha-0.3.0", state: "REWARD", round: 3, revision: 8,
      gold: 13, health: 20, runSeed: "000102030405060708090a0b0c0d0e0f", commandResponses: {},
      combatRecord: { round: 3, winner: "player", resultHash: "rewardoffer123456", finalTick: 10, reason: "elimination", events: [] },
    };

    expect(lifecycle.attachContentRoundRewards(resolvedRun, content)).toMatchObject({
      state: "REWARD",
      roundRewardPlan: { round: 3, supplementalGold: 0, freeRefreshes: 0, offers: [expect.objectContaining({ kind: "normal_item_choice" })] },
    });
  });

  it("builds every Alpha choice shape from the R4, R6, and final-chest encounters", async () => {
    const { compileContentBundle } = await import("@auto-battler/game-core");
    const { buildRoundRewardPlan } = await import("../src/application/reward-selection.js");
    const content = compileContentBundle(JSON.parse(readFileSync(fileURLToPath(new URL("../../content/alpha-0.3.0/bundle.json", import.meta.url)), "utf8")));
    const input = { runSeed: "000102030405060708090a0b0c0d0e0f", content };

    expect(buildRoundRewardPlan({ ...input, round: 4 }).offers).toEqual([
      expect.objectContaining({ kind: "hero_choice", options: expect.arrayContaining([expect.objectContaining({ kind: "hero" })]) }),
    ]);
    expect(buildRoundRewardPlan({ ...input, round: 6 }).offers.map((offer) => offer.kind)).toEqual(["hero_choice", "upgrade_choice"]);
    expect(buildRoundRewardPlan({ ...input, round: 8 }).offers).toEqual([
      expect.objectContaining({ kind: "final_chest", options: expect.arrayContaining([expect.objectContaining({ kind: "normal_item" })]) }),
    ]);
  });
});
