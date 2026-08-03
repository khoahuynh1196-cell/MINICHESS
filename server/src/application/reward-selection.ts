import { createHmac } from "node:crypto";
import type { CompiledContentBundle } from "@auto-battler/game-core";

const SCALE = 1_000;
const RUN_SEED_HEX = /^[0-9a-f]{32,}$/i;

export type RewardOfferKind = "normal_item_choice" | "hero_choice" | "upgrade_choice" | "final_chest";

export interface RewardOption {
  readonly id: string;
  readonly kind: "normal_item" | "hero" | "upgrade";
  readonly cost?: number;
}

export interface RewardOffer {
  readonly id: string;
  readonly kind: RewardOfferKind;
  readonly options: readonly RewardOption[];
}

export interface RewardSelection {
  readonly offerId: string;
  readonly optionId: string;
}

export interface RoundRewardPlan {
  readonly round: number;
  readonly supplementalGold: number;
  readonly freeRefreshes: number;
  readonly offers: readonly RewardOffer[];
}

export interface BuildRoundRewardPlanInput {
  readonly runSeed: string;
  readonly round: number;
  readonly content: CompiledContentBundle;
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new Error(`CONTENT_REWARD_INVALID:${label}`);
  return value;
}

function rewardKind(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("CONTENT_REWARD_INVALID:kind");
  return value;
}

function rankedIds(runSeed: string, stream: string, ids: readonly string[]): readonly string[] {
  return [...ids].sort((left, right) => {
    const leftHash = createHmac("sha256", Buffer.from(runSeed, "hex")).update(`${stream}:${left}`).digest("hex");
    const rightHash = createHmac("sha256", Buffer.from(runSeed, "hex")).update(`${stream}:${right}`).digest("hex");
    return leftHash < rightHash ? -1 : leftHash > rightHash ? 1 : left.localeCompare(right);
  });
}

function selectOptions(
  runSeed: string,
  stream: string,
  kind: RewardOption["kind"],
  options: readonly RewardOption[],
  count: number,
): readonly RewardOption[] {
  if (count > options.length) throw new Error("CONTENT_REWARD_INVALID:not_enough_options");
  const byId = new Map(options.map((option) => [option.id, option]));
  return Object.freeze(rankedIds(runSeed, stream, options.map((option) => option.id)).slice(0, count).map((id) => {
    const option = byId.get(id)!;
    return Object.freeze({ ...option, kind });
  }));
}

export function buildRoundRewardPlan(input: BuildRoundRewardPlanInput): RoundRewardPlan {
  if (!RUN_SEED_HEX.test(input.runSeed) || input.runSeed.length % 2 !== 0) throw new Error("GAME_RULE_VIOLATION");
  const encounter = input.content.encounters.find((candidate) => candidate.round === input.round);
  if (encounter === undefined) throw new Error(`ENCOUNTER_MISSING:${input.round}`);
  let supplementalGold = 0;
  let freeRefreshes = 0;
  const offers: RewardOffer[] = [];
  const heroOptions = [...input.content.heroesById.values()]
    .filter((hero) => !hero.is_unique_hero)
    .map((hero) => ({ id: hero.id, kind: "hero" as const, cost: hero.cost }));
  const itemOptions = input.content.normalItems.map((item) => ({ id: item.id, kind: "normal_item" as const }));

  for (const [index, reward] of encounter.rewards.entries()) {
    const kind = rewardKind(reward.kind);
    const stream = `reward:v1:${input.round}:${index}:${kind}`;
    if (kind === "gold") {
      supplementalGold += Math.floor(requirePositiveInteger(reward.amount, `${encounter.id}:${index}:amount`) / SCALE);
      continue;
    }
    if (kind === "shop_refresh") {
      freeRefreshes += 1;
      continue;
    }
    if (kind === "free_reroll") {
      freeRefreshes += requirePositiveInteger(reward.amount, `${encounter.id}:${index}:amount`);
      continue;
    }
    if (kind === "unique_reveal") continue;
    if (kind === "normal_item_choice") {
      const count = requirePositiveInteger(reward.options, `${encounter.id}:${index}:options`);
      offers.push(Object.freeze({ id: `reward:${input.round}:${kind}:${index}`, kind, options: selectOptions(input.runSeed, stream, "normal_item", itemOptions, count) }));
      continue;
    }
    if (kind === "hero_choice" || kind === "upgrade_choice") {
      const count = kind === "upgrade_choice" ? 3 : requirePositiveInteger(reward.options, `${encounter.id}:${index}:options`);
      offers.push(Object.freeze({ id: `reward:${input.round}:${kind}:${index}`, kind, options: selectOptions(input.runSeed, stream, kind === "upgrade_choice" ? "upgrade" : "hero", heroOptions, count) }));
      continue;
    }
    if (kind === "final_chest") {
      offers.push(Object.freeze({ id: `reward:${input.round}:${kind}:${index}`, kind, options: selectOptions(input.runSeed, stream, "normal_item", itemOptions, 3) }));
      continue;
    }
    throw new Error(`CONTENT_REWARD_UNSUPPORTED:${kind}`);
  }
  return Object.freeze({ round: input.round, supplementalGold, freeRefreshes, offers: Object.freeze(offers) });
}
