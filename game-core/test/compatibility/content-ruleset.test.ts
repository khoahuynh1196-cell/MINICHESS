import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  assertContentRulesetCompatibility,
  compileContentBundle,
  compileRuleset,
  inspectContentRulesetCompatibility,
  type CompiledContentBundle,
} from "../../src/index.js";

const contentPath = fileURLToPath(new URL("../../../content/alpha-0.3.0/bundle.json", import.meta.url));
const rulesPath = fileURLToPath(new URL("../../../rules/production-0.1.0/ruleset.json", import.meta.url));
const content = compileContentBundle(JSON.parse(readFileSync(contentPath, "utf8")));
const rules = compileRuleset(JSON.parse(readFileSync(rulesPath, "utf8")));

function withFirstEnemyPosition(position: number): CompiledContentBundle {
  const encounters = content.encounters.map((encounter, encounterIndex) => {
    if (encounterIndex !== 0 || encounter.enemy_composition === undefined || encounter.enemy_composition.length === 0) {
      return encounter;
    }
    const enemyComposition = encounter.enemy_composition.map((enemy, enemyIndex) =>
      enemyIndex === 0 ? Object.freeze({ ...enemy, position }) : enemy);
    return Object.freeze({ ...encounter, enemy_composition: Object.freeze(enemyComposition) });
  });
  return Object.freeze({ ...content, encounters: Object.freeze(encounters) });
}

describe("content and ruleset compatibility", () => {
  it("accepts the retained twenty-hero Adventure bundle under the declared production rules", () => {
    const report = inspectContentRulesetCompatibility(content, rules, rules.version);

    expect(report).toEqual({ compatible: true, issues: [] });
    expect(() => assertContentRulesetCompatibility(content, rules, rules.version)).not.toThrow();
  });

  it("fails closed when a release declares another ruleset version", () => {
    const report = inspectContentRulesetCompatibility(content, rules, "alpha-rules-0.3.0");

    expect(report.compatible).toBe(false);
    expect(report.issues).toContainEqual({
      code: "RULESET_VERSION_MISMATCH",
      path: "release.ruleset_version",
      message: "Content declares alpha-rules-0.3.0; expected production-rules-0.1.0",
    });
  });

  it("rejects an encounter enemy placed on the player half", () => {
    const invalid = withFirstEnemyPosition(16);
    const report = inspectContentRulesetCompatibility(invalid, rules, rules.version);

    expect(report.compatible).toBe(false);
    expect(report.issues).toContainEqual(expect.objectContaining({
      code: "ENEMY_POSITION_OUTSIDE_ENEMY_HALF",
      path: "encounters.R01_MEADOW_SCOUTS.enemy_composition.0.position",
    }));
    expect(() => assertContentRulesetCompatibility(invalid, rules, rules.version))
      .toThrow("ENEMY_POSITION_OUTSIDE_ENEMY_HALF");
  });

  it("reports issues in deterministic path/code order", () => {
    const invalid = withFirstEnemyPosition(16);
    const report = inspectContentRulesetCompatibility(invalid, rules, "wrong-rules");
    const ordered = [...report.issues].sort((left, right) =>
      left.path.localeCompare(right.path) || left.code.localeCompare(right.code));

    expect(report.issues).toEqual(ordered);
  });
});
