import type { CompiledContentBundle } from "../content/types.js";
import { isEnemyPosition, localPlayerIndexToGlobal } from "../rules/board.js";
import type { CompiledRuleset } from "../rules/types.js";
import { sha256Hex } from "../serialization/canonical-json.js";
import { progressionState } from "../rules/progression.js";
import { assertAdventureGameState } from "./validation.js";
import type { AdventureGameState } from "./state.js";

export interface AdventureCombatBoardContract {
  readonly columns: number;
  readonly rows: number;
  readonly enemyRows: { readonly start: number; readonly end: number };
  readonly playerRows: { readonly start: number; readonly end: number };
}

export interface AdventureCombatHeroRef {
  readonly unitId: string;
  readonly instanceId: string;
  readonly heroId: string;
  readonly stars: 1 | 2 | 3;
  readonly globalPosition: number;
  readonly itemIds: readonly string[];
}

export interface AdventureCombatEnemyRef {
  readonly unitId: string;
  readonly heroId: string;
  readonly globalPosition: number;
  readonly statMultiplier: number;
}

export interface AdventureCombatSnapshot {
  readonly combatId: string;
  readonly combatSeed: string;
  readonly snapshotHash: string;
  readonly runId: string;
  readonly round: number;
  readonly rulesetVersion: string;
  readonly rulesetHash: string;
  readonly contentVersion: string;
  readonly contentHash: string;
  readonly tickRate: number;
  readonly maxTicks: number;
  readonly board: AdventureCombatBoardContract;
  readonly playerUnits: readonly AdventureCombatHeroRef[];
  readonly enemyUnits: readonly AdventureCombatEnemyRef[];
  readonly encounterId: string;
}

function itemIdsForHero(state: AdventureGameState, heroInstanceId: string): readonly string[] {
  return Object.freeze(state.run.items
    .filter((item) => item.equippedHeroInstanceId === heroInstanceId)
    .map((item) => item.itemId)
    .sort());
}

function withoutHash(snapshot: Omit<AdventureCombatSnapshot, "snapshotHash">): Omit<AdventureCombatSnapshot, "snapshotHash"> {
  return snapshot;
}

export function buildAdventureCombatSnapshot(
  state: AdventureGameState,
  rules: CompiledRuleset,
  content: CompiledContentBundle,
): AdventureCombatSnapshot {
  assertAdventureGameState(state, content, rules);
  if (state.run.phase !== "COMBAT") throw new Error("ADVENTURE_COMBAT_SNAPSHOT_NOT_ALLOWED");
  if (state.pendingReward !== undefined) throw new Error("ADVENTURE_COMBAT_SNAPSHOT_HAS_PENDING_REWARD");
  const progression = progressionState(rules, state.run.level, state.run.experience);
  const playerUnits = state.run.board.flatMap((hero, localPosition) => {
    if (hero === null) return [];
    if (localPosition >= progression.boardCap && state.run.board.slice(0, localPosition).filter((entry) => entry !== null).length >= progression.boardCap) {
      throw new Error("ADVENTURE_COMBAT_SNAPSHOT_EXCEEDS_DEPLOYMENT_CAP");
    }
    return [Object.freeze({
      unitId: `player:${hero.instanceId}`,
      instanceId: hero.instanceId,
      heroId: hero.heroId,
      stars: hero.stars,
      globalPosition: localPlayerIndexToGlobal(rules, localPosition),
      itemIds: itemIdsForHero(state, hero.instanceId),
    })];
  });
  if (playerUnits.length === 0) throw new Error("ADVENTURE_COMBAT_SNAPSHOT_EMPTY_PLAYER_TEAM");

  const encounter = content.encounters.find((candidate) => candidate.round === state.run.round);
  if (encounter === undefined || encounter.enemy_composition === undefined) {
    throw new Error(`ADVENTURE_ENCOUNTER_MISSING:${state.run.round}`);
  }
  const enemyUnits = encounter.enemy_composition.map((enemy, index) => {
    if (!isEnemyPosition(rules, enemy.position)) {
      throw new Error(`ADVENTURE_ENEMY_POSITION_INVALID:${encounter.id}:${index}:${enemy.position}`);
    }
    return Object.freeze({
      unitId: `enemy:${encounter.id}:${index}`,
      heroId: enemy.hero_id,
      globalPosition: enemy.position,
      statMultiplier: enemy.stat_multiplier,
    });
  });
  if (enemyUnits.length === 0) throw new Error(`ADVENTURE_ENCOUNTER_EMPTY:${encounter.id}`);

  const combatId = `combat:${state.run.id}:${state.run.round}:${state.run.revision}`;
  const combatSeed = sha256Hex({ seed: state.seed, stream: `combat:${state.run.round}` });
  const canonical = Object.freeze({
    combatId,
    combatSeed,
    runId: state.run.id,
    round: state.run.round,
    rulesetVersion: rules.version,
    rulesetHash: rules.rulesetHash,
    contentVersion: content.version,
    contentHash: content.contentHash,
    tickRate: rules.combat.tickRate,
    maxTicks: rules.combat.maxTicks,
    board: Object.freeze({
      columns: rules.board.columns,
      rows: rules.board.rows,
      enemyRows: Object.freeze({ ...rules.board.enemyRows }),
      playerRows: Object.freeze({ ...rules.board.playerRows }),
    }),
    playerUnits: Object.freeze(playerUnits),
    enemyUnits: Object.freeze(enemyUnits),
    encounterId: encounter.id,
  });
  return Object.freeze({ ...canonical, snapshotHash: sha256Hex(withoutHash(canonical)) });
}
