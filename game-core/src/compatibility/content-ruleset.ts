import type { CompiledContentBundle } from "../content/types.js";
import { assertBoardPosition } from "../rules/board.js";
import type { CompiledRuleset } from "../rules/types.js";

const RETAINED_HERO_IDS = Object.freeze(Array.from({ length: 20 }, (_, index) => `H${String(index + 1).padStart(2, "0")}`));
const RETAINED_UNIQUE_IDS = Object.freeze(Array.from({ length: 6 }, (_, index) => `U${String(index + 1).padStart(2, "0")}`));

function exactIds(actual: readonly string[], expected: readonly string[], label: string): void {
  const normalized = [...actual].sort();
  const expectedNormalized = [...expected].sort();
  if (normalized.length !== expectedNormalized.length || normalized.some((id, index) => id !== expectedNormalized[index])) {
    throw new Error(`${label} does not match retained launch IDs`);
  }
}

function numberField(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}

export function validateContentAgainstRuleset(content: CompiledContentBundle, ruleset: CompiledRuleset): void {
  exactIds([...content.heroesById.values()].filter((hero) => !hero.is_unique_hero).map((hero) => hero.id), RETAINED_HERO_IDS, "shop hero roster");
  if ([...content.heroesById.values()].some((hero) => hero.is_unique_hero)) throw new Error("retained content must not contain Unique heroes");
  exactIds(content.uniqueItems.map((item) => item.id), RETAINED_UNIQUE_IDS, "Unique item roster");

  const deploymentCap = Math.max(...ruleset.progression.levels.map((level) => level.boardCap));
  for (const trait of content.traitsById.values()) {
    const breakpoints = (trait as Record<string, unknown>).breakpoints;
    if (!Array.isArray(breakpoints)) continue;
    for (const breakpoint of breakpoints) {
      if (typeof breakpoint !== "object" || breakpoint === null) continue;
      if (numberField((breakpoint as Record<string, unknown>).count, `${trait.id}.breakpoint.count`) > deploymentCap) {
        throw new Error("trait breakpoint exceeds deployment cap");
      }
    }
  }

  for (const item of [...content.normalItems, ...content.uniqueItems]) {
    const slotCost = numberField((item as Record<string, unknown>).slot_cost, `${item.id}.slot_cost`);
    if (slotCost > ruleset.roster.maxItemsPerHero) throw new Error("item slot cost exceeds ruleset limit");
  }

  const expectedRounds = Array.from({ length: ruleset.adventure.roundCount }, (_, index) => index + 1);
  const actualRounds = content.encounters.map((encounter) => encounter.round).sort((left, right) => left - right);
  if (actualRounds.length !== expectedRounds.length || actualRounds.some((round, index) => round !== expectedRounds[index])) {
    throw new Error("Adventure encounters must cover every ruleset round exactly once");
  }

  const uniqueRevealRounds = content.encounters
    .filter((encounter) => encounter.rewards.some((reward) => reward.kind === "unique_reveal"))
    .map((encounter) => encounter.round);
  if (uniqueRevealRounds.length !== 1 || uniqueRevealRounds[0] !== ruleset.adventure.uniqueRevealRound) {
    throw new Error("unique_reveal does not match ruleset round");
  }

  for (const encounter of content.encounters) {
    for (const enemy of encounter.enemy_composition ?? []) {
      try {
        assertBoardPosition(ruleset.board, enemy.position);
      } catch {
        throw new Error("encounter enemy outside enemy territory");
      }
      const row = Math.floor(enemy.position / ruleset.board.columns);
      if (row < ruleset.board.enemyRows.start || row > ruleset.board.enemyRows.end) {
        throw new Error("encounter enemy outside enemy territory");
      }
    }
  }
}
