export const BOARD_COLUMNS = 4;
export const BOARD_ROWS = 6;
export const BOARD_CELL_COUNT = BOARD_COLUMNS * BOARD_ROWS;
export const PLAYER_FORMATION_SIZE = BOARD_CELL_COUNT / 2;
export const PLAYER_GLOBAL_START = PLAYER_FORMATION_SIZE;

export function isEnemyPosition(position: number): boolean {
  return Number.isSafeInteger(position) && position >= 0 && position < PLAYER_GLOBAL_START;
}

export function isPlayerPosition(position: number): boolean {
  return Number.isSafeInteger(position) && position >= PLAYER_GLOBAL_START && position < BOARD_CELL_COUNT;
}
