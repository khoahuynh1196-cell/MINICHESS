import type { CompiledContentBundle } from "../content/types.js";
import { isEnemyPosition } from "../rules/board.js";
import type { CompiledRuleset } from "../rules/types.js";

export interface CompatibilityIssue {
  readonly code: string;
  readonly path: string;
  readonly message: string;
}

export interface ContentRulesetCompatibility {
  readonly compatible: boolean;
  readonly issues: readonly CompatibilityIssue[];
}

function issue(code: string, path: string, message: string): CompatibilityIssue {
  return Object.freeze({ code, path, message });
}

function traitBreakpointCounts(trait: unknown): readonly number[] {
  if (typeof trait !== "object" || trait === null) return [];
  const breakpoints = (trait as { readonly breakpoints?: unknown }).breakpoints;
  if (!Array.isArray(breakpoints)) return [];
  return breakpoints.flatMap((value) => {
    if (typeof value !== "object" || value === null) return [];
    const count = (value as { readonly count?: unknown }).count;
    return typeof count === "number" && Number.isSafeInteger(count) ? [count] : [];
  });
}

/**
 * Checks whether one immutable content bundle can be interpreted by a compiled
 * ruleset. The declared version comes from the release manifest so legacy
 * content hashes remain unchanged during migration.
 */
export function inspectContentRulesetCompatibility(
  content: CompiledContentBundle,
  rules: CompiledRuleset,
  declaredRulesetVersion: string,
): ContentRulesetCompatibility {
  const issues: CompatibilityIssue[] = [];

  if (declaredRulesetVersion !== rules.version) {
    issues.push(issue(
      "RULESET_VERSION_MISMATCH",
      "release.ruleset_version",
      `Content declares ${declaredRulesetVersion || "no ruleset"}; expected ${rules.version}`,
    ));
  }

  const maxBoardCap = Math.max(...rules.progression.levels.map((entry) => entry.boardCap));
  for (const hero of [...content.heroesById.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    if (hero.is_unique_hero) continue;
    const copies = rules.shop.copiesByRarity[hero.rarity];
    if (copies === undefined || copies <= 0) {
      issues.push(issue("HERO_RARITY_UNAVAILABLE", `heroes.${hero.id}.rarity`, `No pool copies exist for rarity ${hero.rarity}`));
    }
    const canAppear = rules.progression.levels.some((entry) => (rules.shop.oddsByLevel[entry.level]?.[hero.rarity - 1] ?? 0) > 0);
    if (!canAppear) {
      issues.push(issue("HERO_RARITY_NEVER_ROLLS", `heroes.${hero.id}.rarity`, `Rarity ${hero.rarity} has zero odds at every level`));
    }
  }

  for (const [traitId, trait] of [...content.traitsById.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    for (const count of traitBreakpointCounts(trait)) {
      if (count > maxBoardCap) {
        issues.push(issue(
          "TRAIT_BREAKPOINT_UNREACHABLE",
          `traits.${traitId}.breakpoints.${count}`,
          `Breakpoint ${count} exceeds maximum deployment cap ${maxBoardCap}`,
        ));
      }
    }
  }

  const encountersByRound = new Map(content.encounters.map((encounter) => [encounter.round, encounter]));
  for (let round = 1; round <= rules.adventure.roundCount; round += 1) {
    if (!encountersByRound.has(round)) {
      issues.push(issue("ADVENTURE_ROUND_MISSING", `encounters.round.${round}`, `Adventure round ${round} is missing`));
    }
  }
  for (const encounter of [...content.encounters].sort((left, right) => left.round - right.round || left.id.localeCompare(right.id))) {
    if (encounter.round < 1 || encounter.round > rules.adventure.roundCount) {
      issues.push(issue(
        "ADVENTURE_ROUND_OUT_OF_RANGE",
        `encounters.${encounter.id}.round`,
        `Round ${encounter.round} is outside 1..${rules.adventure.roundCount}`,
      ));
    }
    for (const [index, enemy] of (encounter.enemy_composition ?? []).entries()) {
      if (!isEnemyPosition(rules, enemy.position)) {
        issues.push(issue(
          "ENEMY_POSITION_OUTSIDE_ENEMY_HALF",
          `encounters.${encounter.id}.enemy_composition.${index}.position`,
          `Enemy position ${enemy.position} is not on the enemy half of the board`,
        ));
      }
    }
    const hasUniqueReveal = encounter.rewards.some((reward) => reward.kind === "unique_reveal");
    if (hasUniqueReveal && encounter.round !== rules.adventure.uniqueRevealRound) {
      issues.push(issue(
        "UNIQUE_REVEAL_WRONG_ROUND",
        `encounters.${encounter.id}.rewards`,
        `Unique reveal must occur on round ${rules.adventure.uniqueRevealRound}`,
      ));
    }
  }

  const uniqueRevealCount = content.encounters
    .flatMap((encounter) => encounter.rewards)
    .filter((reward) => reward.kind === "unique_reveal").length;
  if (uniqueRevealCount !== 1) {
    issues.push(issue("UNIQUE_REVEAL_COUNT", "encounters.rewards", `Expected one Unique reveal, found ${uniqueRevealCount}`));
  }
  if (content.uniqueItems.length !== content.transformations.length) {
    issues.push(issue(
      "UNIQUE_TRANSFORMATION_CARDINALITY",
      "unique_items",
      `Unique item count ${content.uniqueItems.length} differs from transformation count ${content.transformations.length}`,
    ));
  }

  issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code));
  return Object.freeze({ compatible: issues.length === 0, issues: Object.freeze(issues) });
}

export function assertContentRulesetCompatibility(
  content: CompiledContentBundle,
  rules: CompiledRuleset,
  declaredRulesetVersion: string,
): void {
  const report = inspectContentRulesetCompatibility(content, rules, declaredRulesetVersion);
  if (!report.compatible) {
    throw new Error(report.issues.map((entry) => `${entry.code}@${entry.path}: ${entry.message}`).join("\n"));
  }
}
