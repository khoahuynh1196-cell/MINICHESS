import { loadCanonicalBoardContract } from "../rules/board-contract.js";

const CANONICAL_BOARD = loadCanonicalBoardContract();

export const BOARD_COLUMNS = CANONICAL_BOARD.columns;
export const BOARD_ROWS = CANONICAL_BOARD.rows;
export const BOARD_CELL_COUNT = CANONICAL_BOARD.cellCount;
export const PLAYER_FORMATION_SIZE = CANONICAL_BOARD.playerCellCount;
export const PLAYER_GLOBAL_START = CANONICAL_BOARD.playerStart;

export function isEnemyPosition(position: number): boolean {
  return Number.isSafeInteger(position) && position >= 0 && position < PLAYER_GLOBAL_START;
}

export function isPlayerPosition(position: number): boolean {
  return Number.isSafeInteger(position) && position >= PLAYER_GLOBAL_START && position < BOARD_CELL_COUNT;
}
