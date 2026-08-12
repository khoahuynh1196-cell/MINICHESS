import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CANONICAL_ASSET_MANIFEST_VERSION,
  CANONICAL_CONTENT_VERSION,
  CANONICAL_RULESET_VERSION,
  loadCanonicalBoardContract,
} from "../../src/index.js";

describe("canonical 4x6 board contract", () => {
  it("exposes the versioned 4x6 production contract", () => {
    expect(loadCanonicalBoardContract()).toEqual({
      version: CANONICAL_RULESET_VERSION,
      columns: 4,
      rows: 6,
      cellCount: 24,
      enemyCellCount: 12,
      playerStart: 12,
      playerCellCount: 12,
      benchSlots: 8,
      deploymentCap: 8,
      shopSlots: 5,
      initialLevel: 3,
      maxLevel: 9,
      contentVersion: CANONICAL_CONTENT_VERSION,
      assetManifestVersion: CANONICAL_ASSET_MANIFEST_VERSION,
    });
  });

  it("matches the checked-in production ruleset", () => {
    const path = fileURLToPath(new URL("../../../rules/production-4x6-0.1.0/ruleset.json", import.meta.url));
    const rules = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    expect(rules).toMatchObject({
      version: CANONICAL_RULESET_VERSION,
      content_version: CANONICAL_CONTENT_VERSION,
      asset_manifest_version: CANONICAL_ASSET_MANIFEST_VERSION,
      board: { columns: 4, rows: 6, enemy_cell_count: 12, player_start: 12, player_cell_count: 12 },
      shop: { slots: 5 },
      progression: { initial_level: 3, max_level: 9, deployment_cap: 8 },
    });
  });
});
