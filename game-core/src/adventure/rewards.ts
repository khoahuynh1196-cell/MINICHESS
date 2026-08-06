import type { CompiledContentBundle } from "../content/types.js";
import { createSeededRng } from "../simulation/seeded-rng.js";

const SCALE = 1_000;

export type AdventureRewardOfferKind =
  | "normal_item_choice"
  | "hero_choice"
  | "upgrade_choice"
  | "unique_choice"
  | "final_chest";

export type AdventureRewardOptionKind = "normal_item" | "hero" | "upgrade" | "unique";

export interface AdventureRewardOption {
  readonly id: string;
  readonly kind: AdventureRewardOptionKind;
  readonly cost?: number;
}

export interface AdventureRewardOffer {
  readonly id: string;
  readonly kind: AdventureRewardOfferKind;
  readonly options: readonly AdventureRewardOption[];
}

export interface AdventureRewardSelection {
  readonly offerId: string;
  readonly optionId: string;
}

export interface AdventureRewardPlan {
  readonly round: number;
  readonly supplementalGold: number;
  readonly freeRefreshes: number;
  readonly offers: readonly AdventureRewardOffer[];
}

function requirePositiveInteger(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new Error(`CONTENT_REWARD_INVALID:${label}`);
  }
  return value;
}

function rewardKind(value: unknown): string {
  if (typeof value !== "string" || value.length === 0) throw new Error("CONTENT_REWARD_INVALID:kind");
  return value;
}

function deterministicScore(seed: string, stream: string, id: string): number {
  return createSeededRng(`${seed}:${stream}:${id}`).nextUint32();
}

function selectOptions(
  seed: string,
  stream: string,
  kind: AdventureRewardOptionKind,
  options: readonly AdventureRewardOption[],
  count: number,
): readonly AdventureRewardOption[] {
  if (count > options.length) throw new Error("CONTENT_REWARD_INVALID:not_enough_options");
  return Object.freeze([...options]
    .sort((left, right) => deterministicScore(seed, stream, left.id) - deterministicScore(seed, stream, right.id)
      || left.id.localeCompare(right.id))
    .slice(0, count)
    .map((option) => Object.freeze({ ...option, kind })));
}

export interface BuildAdventureRewardPlanInput {
  readonly seed: string;
  readonly round: number;
  readonly content: CompiledContentBundle;
}

export function buildAdventureRewardPlan(input: BuildAdventureRewardPlanInput): AdventureRewardPlan {
  if (input.seed.length === 0) throw new Error("Adventure reward seed must not be empty");
  if (!Number.isSafeInteger(input.round) || input.round < 1) throw new Error("Adventure reward round must be a positive safe integer");
  const encounter = input.content.encounters.find((candidate) => candidate.round === input.round);
  if (encounter === undefined) throw new Error(`ENCOUNTER_MISSING:${input.round}`);

  let supplementalGold = 0;
  let freeRefreshes = 0;
  const offers: AdventureRewardOffer[] = [];
  const heroOptions = [...input.content.heroesById.values()]
    .filter((hero) => !hero.is_unique_hero)
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((hero) => Object.freeze({ id: hero.id, kind: "hero" as const, cost: hero.cost }));
  const itemOptions = [...input.content.normalItems]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => Object.freeze({ id: item.id, kind: "normal_item" as const }));
  const uniqueOptions = [...input.content.uniqueItems]
    .sort((left, right) => left.id.localeCompare(right.id))
    .map((item) => Object.freeze({ id: item.id, kind: "unique" as const }));

  for (const [index, reward] of encounter.rewards.entries()) {
    const kind = rewardKind(reward.kind);
    const stream = `reward:v2:${input.round}:${index}:${kind}`;
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
    if (kind === "unique_reveal") {
      offers.push(Object.freeze({
        id: `reward:${input.round}:unique_choice:${index}`,
        kind: "unique_choice",
        options: selectOptions(input.seed, stream, "unique", uniqueOptions, 3),
      }));
      continue;
    }
    if (kind === "normal_item_choice") {
      const count = requirePositiveInteger(reward.options, `${encounter.id}:${index}:options`);
      offers.push(Object.freeze({
        id: `reward:${input.round}:${kind}:${index}`,
        kind,
        options: selectOptions(input.seed, stream, "normal_item", itemOptions, count),
      }));
      continue;
    }
    if (kind === "hero_choice" || kind === "upgrade_choice") {
      const count = kind === "upgrade_choice" ? 3 : requirePositiveInteger(reward.options, `${encounter.id}:${index}:options`);
      offers.push(Object.freeze({
        id: `reward:${input.round}:${kind}:${index}`,
        kind,
        options: selectOptions(input.seed, stream, kind === "upgrade_choice" ? "upgrade" : "hero", heroOptions, count),
      }));
      continue;
    }
    if (kind === "final_chest") {
      offers.push(Object.freeze({
        id: `reward:${input.round}:${kind}:${index}`,
        kind,
        options: selectOptions(input.seed, stream, "normal_item", itemOptions, 3),
      }));
      continue;
    }
    throw new Error(`CONTENT_REWARD_UNSUPPORTED:${kind}`);
  }

  return Object.freeze({
    round: input.round,
    supplementalGold,
    freeRefreshes,
    offers: Object.freeze(offers),
  });
}

export function validateAdventureRewardSelections(
  plan: AdventureRewardPlan,
  selections: readonly AdventureRewardSelection[],
): readonly AdventureRewardOption[] {
  if (selections.length !== plan.offers.length) throw new Error("ADVENTURE_REWARD_SELECTION_REQUIRED");
  const byOffer = new Map(plan.offers.map((offer) => [offer.id, offer]));
  const seenOffers = new Set<string>();
  const selected: AdventureRewardOption[] = [];
  for (const selection of selections) {
    if (seenOffers.has(selection.offerId)) throw new Error("ADVENTURE_REWARD_SELECTION_DUPLICATE");
    seenOffers.add(selection.offerId);
    const offer = byOffer.get(selection.offerId);
    if (offer === undefined) throw new Error("ADVENTURE_REWARD_SELECTION_INVALID");
    const option = offer.options.find((candidate) => candidate.id === selection.optionId);
    if (option === undefined) throw new Error("ADVENTURE_REWARD_SELECTION_INVALID");
    selected.push(option);
  }
  return Object.freeze(selected);
}
