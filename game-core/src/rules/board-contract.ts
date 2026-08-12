export const CANONICAL_RULESET_VERSION = "production-4x6-0.1.0" as const;
export const CANONICAL_CONTENT_VERSION = "alpha-0.4.0" as const;
export const CANONICAL_ASSET_MANIFEST_VERSION = "asset-4x6-0.1.0" as const;

export interface BoardContract {
  readonly version: typeof CANONICAL_RULESET_VERSION;
  readonly columns: 4;
  readonly rows: 6;
  readonly cellCount: 24;
  readonly enemyCellCount: 12;
  readonly playerStart: 12;
  readonly playerCellCount: 12;
  readonly benchSlots: 8;
  readonly deploymentCap: 8;
  readonly shopSlots: 5;
  readonly initialLevel: 3;
  readonly maxLevel: 9;
  readonly contentVersion: typeof CANONICAL_CONTENT_VERSION;
  readonly assetManifestVersion: typeof CANONICAL_ASSET_MANIFEST_VERSION;
}

const CANONICAL_BOARD_CONTRACT: BoardContract = Object.freeze({
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

export function loadCanonicalBoardContract(): BoardContract {
  return CANONICAL_BOARD_CONTRACT;
}
