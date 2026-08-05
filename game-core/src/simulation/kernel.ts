import { createSeededRng } from "./seeded-rng.js";
import { validateEffectDefinition, type CombatEffect, type CombatStat } from "../effects/definitions.js";
import { fnv1a64Hex, stableStringify } from "../serialization/canonical-json.js";
import type { CombatTriggerKind } from "../content/types.js";
import {
  assertBoardGeometry,
  assertBoardPosition,
  boardCellCount,
  findPathToRange,
  manhattanDistance,
  selectNearestTarget,
  sortedNeighbors,
  type BoardSide,
  type TargetingUnit,
} from "../rules/board.js";
import type { BoardGeometry } from "../rules/types.js";

export const SCALE = 1_000;
const MAX_COMBAT_TICKS = 700;

export type CombatSide = BoardSide;
export type CombatImmunity = "knockback";

export interface CombatSkill {
  readonly id: string;
  readonly castTimeTicks: number;
  readonly effects?: readonly CombatEffect[];
}

export interface CombatPassive {
  readonly ownerId: string;
  readonly triggerId: string;
  readonly trigger: CombatTriggerKind;
  readonly effects: readonly CombatEffect[];
  readonly cooldownTicks?: number;
  readonly thresholdPercent?: number;
  readonly attackCount?: number;
  readonly stationaryIntervalTicks?: number;
  readonly oncePerCombat?: boolean;
  readonly oncePerOwnerPerCombat?: boolean;
  readonly basicOnly?: boolean;
  readonly lifestealPerThousand?: number;
}

export interface CombatUnit {
  readonly id: string;
  readonly side: CombatSide;
  readonly position: number;
  readonly maxHp: number;
  readonly attackDamage: number;
  readonly attackSpeed: number;
  readonly armor: number;
  readonly magicResist: number;
  readonly attackRange: number;
  readonly startingMana: number;
  readonly maxMana: number;
  readonly critChance: number;
  readonly critMultiplier: number;
  readonly moveSpeed?: number;
  readonly skillPower?: number;
  readonly healShieldPower?: number;
  readonly skill?: CombatSkill | undefined;
  readonly passives?: readonly CombatPassive[];
  readonly immunities?: readonly CombatImmunity[];
}

export interface CombatSnapshot {
  readonly combatId: string;
  readonly contentVersion: string;
  readonly rulesetVersion: string;
  readonly combatSeed: string;
  readonly board: BoardGeometry;
  readonly units: readonly CombatUnit[];
  readonly maxTicks?: number;
  readonly defenderSide?: CombatSide;
}

export interface CombatEvent {
  readonly sequence: number;
  readonly tick: number;
  readonly type:
    | "COMBAT_STARTED"
    | "UNIT_SPAWNED"
    | "TARGET_SELECTED"
    | "UNIT_MOVED"
    | "BASIC_ATTACK"
    | "DAMAGE_APPLIED"
    | "MANA_CHANGED"
    | "CAST_STARTED"
    | "CAST_RESOLVED"
    | "EFFECT_APPLIED"
    | "HEAL_APPLIED"
    | "SHIELD_APPLIED"
    | "STUN_APPLIED"
    | "STAT_MODIFIER_APPLIED"
    | "SLOW_APPLIED"
    | "UNIT_SUMMONED"
    | "UNIT_DISPLACED"
    | "CLEANSE_APPLIED"
    | "SUMMON_EXPIRED"
    | "UNIT_DIED"
    | "COMBAT_ENDED";
  readonly sourceUnitId?: string;
  readonly targetUnitId?: string;
  readonly payload: Readonly<Record<string, string | number | boolean>>;
}

export interface CombatResult {
  readonly events: readonly CombatEvent[];
  readonly finalTick: number;
  readonly reason: "elimination" | "timeout";
  readonly resultHash: string;
  readonly units: readonly RuntimeUnit[];
  readonly winner: CombatSide;
}

export interface RuntimeUnit {
  readonly id: string;
  readonly side: CombatSide;
  readonly isSummon: boolean;
  readonly position: number;
  readonly currentHp: number;
  readonly mana: number;
  readonly attackMeter: number;
}


interface MutableRuntimeUnit {
  id: string;
  side: CombatSide;
  position: number;
  currentHp: number;
  maxHp: number;
  attackDamage: number;
  attackSpeed: number;
  moveSpeed: number;
  armor: number;
  magicResist: number;
  mana: number;
  maxMana: number;
  attackMeter: number;
  attackRange: number;
  critChance: number;
  critMultiplier: number;
  skillPower: number;
  healShieldPower: number;
  skill: CombatSkill | undefined;
  castRemainingTicks: number;
  castTargetId: string | undefined;
  shields: MutableShield[];
  dots: MutableDot[];
  modifiers: TimedModifier[];
  slows: TimedSlow[];
  damageReductions: TimedDamageReduction[];
  movedThisTick: boolean;
  moveMeter: number;
  isSummon: boolean;
  summonExpiresAtTick: number | undefined;
  stunnedUntilTick: number;
  passives: readonly CombatPassive[];
  immunities: ReadonlySet<CombatImmunity>;
}

interface MutableShield {
  id: string;
  value: number;
  expiresAtTick: number;
  sequence: number;
}

interface MutableDot {
  id: string;
  sourceUnitId: string;
  value: number;
  damageType: "physical" | "magic" | "true";
  nextTick: number;
  intervalTicks: number;
  expiresAtTick: number;
  cleanseable: boolean;
}

interface TimedModifier {
  id: string;
  stackKey: string;
  kind: "buff" | "debuff";
  stat: CombatStat;
  mode: "flat" | "percent";
  value: number;
  appliedDelta: number;
  expiresAtTick: number;
  cleanseable: boolean;
  removeOnMove: boolean;
  stackBaseValue: number;
}

interface TimedSlow {
  id: string;
  value: number;
  expiresAtTick: number;
  cleanseable: boolean;
}

interface TimedDamageReduction {
  id: string;
  stackKey: string;
  value: number;
  expiresAtTick: number;
}

function compareStrings(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function assertSafeInteger(value: number, label: string, minimum = 0): void {
  if (!Number.isSafeInteger(value) || value < minimum) {
    throw new Error(`${label} must be a safe integer greater than or equal to ${minimum}`);
  }
}

function assertUnit(board: BoardGeometry, unit: CombatUnit): void {
  if (unit.id.length === 0) {
    throw new Error("Unit ID must not be empty");
  }
  if (unit.side !== "player" && unit.side !== "enemy") {
    throw new Error(`Invalid unit side for ${unit.id}`);
  }
  try {
    assertBoardPosition(board, unit.position);
  } catch {
    throw new Error(`Invalid board position for ${unit.id}`);
  }

  assertSafeInteger(unit.maxHp, `maxHp for ${unit.id}`, 1);
  assertSafeInteger(unit.attackDamage, `attackDamage for ${unit.id}`);
  assertSafeInteger(unit.attackSpeed, `attackSpeed for ${unit.id}`);
  assertSafeInteger(unit.armor, `armor for ${unit.id}`);
  assertSafeInteger(unit.magicResist, `magicResist for ${unit.id}`);
  assertSafeInteger(unit.attackRange, `attackRange for ${unit.id}`, 1);
  assertSafeInteger(unit.startingMana, `startingMana for ${unit.id}`);
  assertSafeInteger(unit.maxMana, `maxMana for ${unit.id}`, 1);
  assertSafeInteger(unit.critChance, `critChance for ${unit.id}`);
  assertSafeInteger(unit.critMultiplier, `critMultiplier for ${unit.id}`, SCALE);
  assertSafeInteger(unit.moveSpeed ?? SCALE, `moveSpeed for ${unit.id}`, 1);
  assertSafeInteger(unit.skillPower ?? 0, `skillPower for ${unit.id}`);
  assertSafeInteger(unit.healShieldPower ?? 0, `healShieldPower for ${unit.id}`);
  for (const immunity of unit.immunities ?? []) {
    if (immunity !== "knockback") throw new Error(`Invalid immunity for ${unit.id}: ${immunity}`);
  }

  if (unit.startingMana > unit.maxMana) {
    throw new Error(`startingMana must not exceed maxMana for ${unit.id}`);
  }
  if (unit.skill !== undefined) {
    if (unit.skill.id.length === 0 || !Number.isSafeInteger(unit.skill.castTimeTicks) || unit.skill.castTimeTicks < 1) {
      throw new Error(`Invalid skill for ${unit.id}`);
    }
    unit.skill.effects?.forEach(validateEffectDefinition);
  }
  for (const passive of unit.passives ?? []) {
    if (passive.ownerId.length === 0 || passive.triggerId.length === 0) throw new Error(`Invalid passive ID for ${unit.id}`);
    passive.effects.forEach(validateEffectDefinition);
  }
}

export function canonicalizeSnapshot(snapshot: CombatSnapshot): CombatSnapshot {
  if (snapshot.combatId.length === 0 || snapshot.contentVersion.length === 0 || snapshot.rulesetVersion.length === 0) {
    throw new Error("Combat and version IDs must not be empty");
  }
  if (snapshot.combatSeed.length === 0) {
    throw new Error("combatSeed must not be empty");
  }
  if (snapshot.units.length === 0) {
    throw new Error("Combat snapshot requires at least one unit");
  }

  assertBoardGeometry(snapshot.board);
  const board: BoardGeometry = Object.freeze({
    columns: snapshot.board.columns,
    rows: snapshot.board.rows,
    enemyRows: Object.freeze({ ...snapshot.board.enemyRows }),
    playerRows: Object.freeze({ ...snapshot.board.playerRows }),
    movement: snapshot.board.movement,
  });

  const maxTicks = snapshot.maxTicks ?? MAX_COMBAT_TICKS;
  assertSafeInteger(maxTicks, "maxTicks", 1);
  if (maxTicks > MAX_COMBAT_TICKS) {
    throw new Error(`maxTicks must not exceed ${MAX_COMBAT_TICKS}`);
  }

  const unitIds = new Set<string>();
  const positions = new Set<number>();
  const units = snapshot.units.map((unit) => ({
    ...unit,
    ...(unit.passives === undefined ? {} : {
      passives: Object.freeze([...unit.passives]
        .sort((left, right) => compareStrings(left.ownerId, right.ownerId) || compareStrings(left.triggerId, right.triggerId))
        .map((passive) => Object.freeze({ ...passive, effects: Object.freeze([...passive.effects]) }))),
    }),
    ...(unit.immunities === undefined ? {} : { immunities: Object.freeze([...unit.immunities].sort(compareStrings)) }),
  }));

  for (const unit of units) {
    assertUnit(board, unit);
    if (unitIds.has(unit.id)) {
      throw new Error(`Duplicate unit ID: ${unit.id}`);
    }
    if (positions.has(unit.position)) {
      throw new Error(`Board position ${unit.position} is already occupied`);
    }
    unitIds.add(unit.id);
    positions.add(unit.position);
  }

  units.sort((left, right) => compareStrings(left.id, right.id));

  return Object.freeze({
    combatId: snapshot.combatId,
    contentVersion: snapshot.contentVersion,
    rulesetVersion: snapshot.rulesetVersion,
    combatSeed: snapshot.combatSeed,
    board,
    maxTicks,
    defenderSide: snapshot.defenderSide ?? "enemy",
    units: Object.freeze(units),
  });
}

export function hashCombatSnapshot(snapshot: CombatSnapshot): string {
  return fnv1a64Hex(stableStringify(canonicalizeSnapshot(snapshot)));
}

function createMutableRuntimeUnit(unit: CombatUnit): MutableRuntimeUnit {
  return {
    id: unit.id,
    side: unit.side,
    position: unit.position,
    currentHp: unit.maxHp,
    maxHp: unit.maxHp,
    attackDamage: unit.attackDamage,
    attackSpeed: unit.attackSpeed,
    moveSpeed: unit.moveSpeed ?? SCALE,
    armor: unit.armor,
    magicResist: unit.magicResist,
    mana: unit.startingMana,
    maxMana: unit.maxMana,
    attackMeter: 0,
    attackRange: unit.attackRange,
    critChance: unit.critChance,
    critMultiplier: unit.critMultiplier,
    skillPower: unit.skillPower ?? 0,
    healShieldPower: unit.healShieldPower ?? 0,
    skill: unit.skill,
    castRemainingTicks: 0,
    castTargetId: undefined,
    shields: [],
    dots: [],
    modifiers: [],
    slows: [],
    damageReductions: [],
    movedThisTick: false,
    moveMeter: 0,
    isSummon: false,
    summonExpiresAtTick: undefined,
    stunnedUntilTick: 0,
    passives: unit.passives ?? [],
    immunities: new Set(unit.immunities ?? []),
  };
}

export function resolveDamage(rawDamage: number, resistance: number): number {
  assertSafeInteger(rawDamage, "rawDamage");
  if (!Number.isSafeInteger(resistance)) {
    throw new Error("resistance must be a safe integer");
  }

  const effectiveResistance = Math.floor(Math.max(0, resistance) / SCALE);
  return Math.floor((rawDamage * 100) / (100 + effectiveResistance));
}

function changeStat(unit: MutableRuntimeUnit, stat: CombatStat, delta: number): void {
  switch (stat) {
    case "attack_damage":
      unit.attackDamage = Math.max(0, unit.attackDamage + delta);
      return;
    case "attack_speed":
      unit.attackSpeed = Math.max(0, unit.attackSpeed + delta);
      return;
    case "armor":
      unit.armor = Math.max(0, unit.armor + delta);
      return;
    case "magic_resist":
      unit.magicResist = Math.max(0, unit.magicResist + delta);
      return;
    case "move_speed":
      unit.moveSpeed = Math.max(1, unit.moveSpeed + delta);
      return;
    case "max_hp":
      unit.maxHp = Math.max(1, unit.maxHp + delta);
      unit.currentHp = Math.min(unit.currentHp, unit.maxHp);
      return;
    case "max_mana":
      unit.maxMana = Math.max(1, unit.maxMana + delta);
      unit.mana = Math.min(unit.mana, unit.maxMana);
      return;
    case "crit_chance":
      unit.critChance = Math.max(0, unit.critChance + delta);
      return;
    case "crit_multiplier":
      unit.critMultiplier = Math.max(SCALE, unit.critMultiplier + delta);
      return;
    case "skill_power":
      unit.skillPower = Math.max(0, unit.skillPower + delta);
      return;
    case "starting_mana":
      return;
  }
}

function clearMoveResetModifiers(unit: MutableRuntimeUnit): void {
  for (const modifier of unit.modifiers) {
    if (modifier.removeOnMove) changeStat(unit, modifier.stat, -modifier.appliedDelta);
  }
  unit.modifiers = unit.modifiers.filter((modifier) => !modifier.removeOnMove);
}

function markUnitMoved(unit: MutableRuntimeUnit): void {
  unit.movedThisTick = true;
  clearMoveResetModifiers(unit);
}

function readStat(unit: MutableRuntimeUnit, stat: CombatStat): number {
  switch (stat) {
    case "attack_damage": return unit.attackDamage;
    case "attack_speed": return unit.attackSpeed;
    case "armor": return unit.armor;
    case "magic_resist": return unit.magicResist;
    case "move_speed": return unit.moveSpeed;
    case "max_hp": return unit.maxHp;
    case "max_mana": return unit.maxMana;
    case "crit_chance": return unit.critChance;
    case "crit_multiplier": return unit.critMultiplier;
    case "skill_power": return unit.skillPower;
    case "starting_mana": return 0;
  }
}

function sortUnitsById(units: readonly MutableRuntimeUnit[]): MutableRuntimeUnit[] {
  return [...units].sort((left, right) => compareStrings(left.id, right.id));
}

function selectEffectTargets(
  board: BoardGeometry,
  effect: CombatEffect,
  source: MutableRuntimeUnit,
  lockedTarget: MutableRuntimeUnit | undefined,
  allUnits: readonly MutableRuntimeUnit[],
  traitOwnerId?: string,
): MutableRuntimeUnit[] {
  const livingUnits = allUnits.filter((unit) => unit.currentHp > 0);

  switch (effect.target) {
    case "self":
      return source.currentHp > 0 ? [source] : [];
    case "locked_target":
      return lockedTarget === undefined || lockedTarget.currentHp <= 0 ? [] : [lockedTarget];
    case "nearest_other_enemy": {
      const origin = lockedTarget ?? source;
      const enemies = livingUnits
        .filter((unit) => unit.side !== source.side && unit.id !== lockedTarget?.id)
        .sort((left, right) => manhattanDistance(board, left.position, origin.position) - manhattanDistance(board, right.position, origin.position)
          || compareStrings(left.id, right.id));
      return enemies[0] === undefined ? [] : [enemies[0]];
    }
    case "all_enemies":
      return sortUnitsById(livingUnits.filter((unit) => unit.side !== source.side));
    case "adjacent_enemies":
      return sortUnitsById(
        livingUnits.filter((unit) => unit.side !== source.side && manhattanDistance(board, unit.position, source.position) === 1),
      );
    case "adjacent_allies":
      return sortUnitsById(
        livingUnits.filter((unit) => unit.id !== source.id && unit.side === source.side && manhattanDistance(board, unit.position, source.position) === 1),
      );
    case "lowest_hp_ally": {
      const allies = livingUnits.filter((unit) => unit.side === source.side);
      allies.sort((left, right) => {
        const hpDelta = left.currentHp * right.maxHp - right.currentHp * left.maxHp;
        if (hpDelta !== 0) {
          return hpDelta;
        }
        return compareStrings(left.id, right.id);
      });
      return allies[0] === undefined ? [] : [allies[0]];
    }
    case "rear_ally": {
      const direction = source.side === "player" ? board.columns : -board.columns;
      const position = source.position + direction;
      const ally = livingUnits.find((unit) => unit.side === source.side && unit.position === position);
      return ally === undefined ? [] : [ally];
    }
    case "nearest_trait_ally": {
      if (traitOwnerId === undefined) return [];
      const allies = livingUnits
        .filter((unit) => unit.id !== source.id && unit.side === source.side && unit.passives.some((passive) => passive.ownerId === traitOwnerId))
        .sort((left, right) => manhattanDistance(board, left.position, source.position) - manhattanDistance(board, right.position, source.position)
          || compareStrings(left.id, right.id));
      return allies[0] === undefined ? [] : [allies[0]];
    }
    case "adjacent_trait_allies": {
      if (traitOwnerId === undefined) return [];
      return sortUnitsById(livingUnits.filter((unit) => unit.id !== source.id
        && unit.side === source.side
        && manhattanDistance(board, unit.position, source.position) === 1
        && unit.passives.some((passive) => passive.ownerId === traitOwnerId)));
    }
    case "all_trait_allies": {
      if (traitOwnerId === undefined) return [];
      return sortUnitsById(livingUnits.filter((unit) => unit.side === source.side
        && unit.passives.some((passive) => passive.ownerId === traitOwnerId)));
    }
  }
}

function effectValue(source: MutableRuntimeUnit, target: MutableRuntimeUnit, effect: CombatEffect): number {
  let value = effect.baseValue ?? 0;
  if (effect.scalesWithMaxHp === true) value = Math.floor((source.maxHp * value) / SCALE);
  if (effect.scalesWithTargetMaxHp === true) value = Math.floor((target.maxHp * value) / SCALE);
  if (effect.scalesWithAttackDamage === true) value = Math.floor((source.attackDamage * value) / SCALE);
  value = effect.scalesWithSkillPower === true
    ? Math.floor((value * (SCALE + source.skillPower)) / SCALE)
    : value;
  return effect.primitive === "heal" || effect.primitive === "shield"
    ? Math.floor((value * (SCALE + source.healShieldPower)) / SCALE)
    : value;
}

/**
 * Runs the authoritative shell of a combat. Combat actions are deliberately
 * added in later rule modules; this kernel owns canonical input, tick bounds,
 * event sequencing and replay hashing from the first implementation.
 */
export function runHeadlessCombat(input: CombatSnapshot): CombatResult {
  const snapshot = canonicalizeSnapshot(input);
  const events: CombatEvent[] = [];
  let sequence = 0;

  const emit = (
    tick: number,
    type: CombatEvent["type"],
    payload: CombatEvent["payload"],
    sourceUnitId?: string,
    targetUnitId?: string,
  ): void => {
    const event: CombatEvent = {
      sequence,
      tick,
      type,
      payload: Object.freeze({ ...payload }),
      ...(sourceUnitId === undefined ? {} : { sourceUnitId }),
      ...(targetUnitId === undefined ? {} : { targetUnitId }),
    };
    sequence += 1;
    events.push(Object.freeze(event));
  };

  const survivingWinner = (): CombatSide | undefined => {
    const sides = new Set(runtimeUnits.filter((unit) => unit.currentHp > 0).map((unit) => unit.side));
    return sides.size === 1 ? (sides.values().next().value as CombatSide) : undefined;
  };

  const timeoutWinner = (): CombatSide => {
    const score = (side: CombatSide): { numerator: bigint; denominator: bigint } => {
      let numerator = 0n;
      let denominator = 1n;

      for (const unit of runtimeUnits) {
        if (unit.side !== side || unit.isSummon) {
          continue;
        }
        numerator = numerator * BigInt(unit.maxHp) + BigInt(unit.currentHp) * denominator;
        denominator *= BigInt(unit.maxHp);
      }

      return { numerator, denominator };
    };

    const playerScore = score("player");
    const enemyScore = score("enemy");
    const comparison = playerScore.numerator * enemyScore.denominator
      - enemyScore.numerator * playerScore.denominator;

    if (comparison > 0n) {
      return "player";
    }
    if (comparison < 0n) {
      return "enemy";
    }
    return snapshot.defenderSide ?? "enemy";
  };

  const applyDamage = (
    tick: number,
    source: MutableRuntimeUnit | undefined,
    target: MutableRuntimeUnit,
    rawDamage: number,
    damageType: "physical" | "magic" | "true",
    grantAttackerMana = false,
  ): number => {
    const resistance = damageType === "physical" ? target.armor : target.magicResist;
    let remainingDamage = damageType === "true" ? rawDamage : resolveDamage(rawDamage, resistance);
    const reduction = Math.min(900, target.damageReductions.reduce((total, active) => total + active.value, 0));
    remainingDamage = Math.floor((remainingDamage * (SCALE - reduction)) / SCALE);
    const amountBeforeShields = remainingDamage;
    const orderedShields = [...target.shields].sort(
      (left, right) => left.expiresAtTick - right.expiresAtTick || left.sequence - right.sequence,
    );

    for (const shield of orderedShields) {
      if (remainingDamage === 0) {
        break;
      }
      const absorbed = Math.min(shield.value, remainingDamage);
      shield.value -= absorbed;
      remainingDamage -= absorbed;
    }
    target.shields = target.shields.filter((shield) => shield.value > 0);

    const previousHp = target.currentHp;
    target.currentHp = Math.max(0, target.currentHp - remainingDamage);
    emit(
      tick,
      "DAMAGE_APPLIED",
      {
        amount: remainingDamage,
        damageType,
        mitigatedAmount: amountBeforeShields,
        remainingHp: target.currentHp,
      },
      source?.id,
      target.id,
    );

    if (grantAttackerMana && source !== undefined) {
      const attackerMana = Math.min(source.maxMana, source.mana + 10 * SCALE);
      if (attackerMana !== source.mana) {
        source.mana = attackerMana;
        emit(tick, "MANA_CHANGED", { mana: source.mana, reason: "basic_attack" }, source.id);
      }
    }
    const defenderMana = Math.min(target.maxMana, target.mana + 5 * SCALE);
    if (defenderMana !== target.mana) {
      target.mana = defenderMana;
      emit(tick, "MANA_CHANGED", { mana: target.mana, reason: "damage_taken" }, target.id);
    }

    if (previousHp > 0 && target.currentHp === 0) {
      emit(tick, "UNIT_DIED", { side: target.side }, undefined, target.id);
      dispatchPassives(tick, "on_death", target, source);
      if (source !== undefined && source.currentHp > 0) dispatchPassives(tick, "on_kill", source, target);
    }
    if (target.currentHp > 0) dispatchPassives(tick, "on_hp_below", target, source);
    return remainingDamage;
  };

  const executeEffects = (
    tick: number,
    source: MutableRuntimeUnit,
    lockedTarget: MutableRuntimeUnit | undefined,
    effects: readonly CombatEffect[],
    traitOwnerId?: string,
  ): void => {
    for (const effect of effects) {
      for (const target of selectEffectTargets(snapshot.board, effect, source, lockedTarget, runtimeUnits, traitOwnerId)) {
        emit(tick, "EFFECT_APPLIED", { effectId: effect.id, primitive: effect.primitive }, source.id, target.id);
        switch (effect.primitive) {
          case "deal_damage":
            applyDamage(tick, source, target, effectValue(source, target, effect), effect.damageType!);
            break;
          case "restore_mana": {
            const mana = Math.min(target.maxMana, target.mana + effectValue(source, target, effect));
            if (mana !== target.mana) {
              target.mana = mana;
              emit(tick, "MANA_CHANGED", { mana, reason: "effect" }, source.id, target.id);
            }
            break;
          }
          case "damage_reduction": {
            const reductionId = `${source.id}:${effect.id}`;
            const existing = target.damageReductions.find((reduction) => reduction.id === reductionId);
            if (existing !== undefined) {
              existing.value = effectValue(source, target, effect);
              existing.expiresAtTick = tick + effect.durationTicks!;
            } else {
              target.damageReductions.push({
                id: reductionId,
                stackKey: effect.id,
                value: effectValue(source, target, effect),
                expiresAtTick: tick + effect.durationTicks!,
              });
            }
            if (effect.maxStacks !== undefined) {
              const retainedIds = new Set(target.damageReductions
                .filter((reduction) => reduction.stackKey === effect.id)
                .sort((left, right) => compareStrings(left.id, right.id))
                .slice(0, effect.maxStacks)
                .map((reduction) => reduction.id));
              target.damageReductions = target.damageReductions.filter((reduction) => reduction.stackKey !== effect.id || retainedIds.has(reduction.id));
            }
            break;
          }
          case "heal": {
            const amount = effectValue(source, target, effect);
            target.currentHp = Math.min(target.maxHp, target.currentHp + amount);
            emit(tick, "HEAL_APPLIED", { amount, remainingHp: target.currentHp }, source.id, target.id);
            dispatchPassives(tick, "on_heal_or_shield", source, target);
            break;
          }
          case "shield": {
            const durationTicks = effect.durationTicks!;
            target.shields.push({
              id: effect.id,
              value: effectValue(source, target, effect),
              expiresAtTick: tick + durationTicks,
              sequence: sequence,
            });
            emit(
              tick,
              "SHIELD_APPLIED",
              { amount: effectValue(source, target, effect), expiresAtTick: tick + durationTicks },
              source.id,
              target.id,
            );
            dispatchPassives(tick, "on_heal_or_shield", source, target);
            break;
          }
          case "stun":
            target.stunnedUntilTick = Math.max(target.stunnedUntilTick, tick + effect.durationTicks!);
            emit(tick, "STUN_APPLIED", { expiresAtTick: target.stunnedUntilTick }, source.id, target.id);
            break;
          case "apply_dot":
            target.dots.push({
              id: effect.id,
              sourceUnitId: source.id,
              value: effectValue(source, target, effect),
              damageType: effect.damageType!,
              nextTick: tick + effect.intervalTicks!,
              intervalTicks: effect.intervalTicks!,
              expiresAtTick: tick + effect.durationTicks!,
              cleanseable: effect.cleanseable === true,
            });
            break;
          case "slow":
            target.slows.push({
              id: effect.id,
              value: effectValue(source, target, effect),
              expiresAtTick: tick + effect.durationTicks!,
              cleanseable: effect.cleanseable === true,
            });
            emit(tick, "SLOW_APPLIED", { value: effectValue(source, target, effect) }, source.id, target.id);
            break;
          case "buff_stat":
          case "debuff_stat": {
            const stackKey = `${source.id}:${effect.id}`;
            const stackedModifiers = target.modifiers.filter((modifier) => modifier.stackKey === stackKey);
            if (effect.maxStacks !== undefined && stackedModifiers.length >= effect.maxStacks) {
              for (const modifier of stackedModifiers) modifier.expiresAtTick = tick + effect.durationTicks!;
              break;
            }
            const modifierId = effect.maxStacks === undefined ? effect.id : `${stackKey}:${stackedModifiers.length}`;
            const existingModifier = target.modifiers.find((modifier) => modifier.id === modifierId);
            if (existingModifier !== undefined) {
              existingModifier.expiresAtTick = tick + effect.durationTicks!;
              emit(tick, "STAT_MODIFIER_APPLIED", { stat: existingModifier.stat, value: existingModifier.value }, source.id, target.id);
              break;
            }
            const value = effectValue(source, target, effect);
            const stackBaseValue = stackedModifiers[0]?.stackBaseValue ?? readStat(target, effect.stat!);
            const unsignedDelta = effect.modifierMode === "percent"
              ? Math.floor((stackBaseValue * value) / SCALE)
              : value;
            const appliedDelta = effect.primitive === "buff_stat" ? unsignedDelta : -unsignedDelta;
            const modifier: TimedModifier = {
              id: modifierId,
              stackKey,
              kind: effect.primitive === "buff_stat" ? "buff" : "debuff",
              stat: effect.stat!,
              mode: effect.modifierMode!,
              value,
              appliedDelta,
              expiresAtTick: tick + effect.durationTicks!,
              cleanseable: effect.cleanseable === true,
              removeOnMove: effect.removeOnMove === true,
              stackBaseValue,
            };
            changeStat(target, modifier.stat, modifier.appliedDelta);
            target.modifiers.push(modifier);
            emit(tick, "STAT_MODIFIER_APPLIED", { stat: modifier.stat, value }, source.id, target.id);
            break;
          }
          case "dash": {
            if (lockedTarget === undefined) {
              break;
            }
            const occupied = runtimeUnits
              .filter((unit) => unit.currentHp > 0 && unit.id !== target.id)
              .map((unit) => unit.position);
            const path = findPathToRange(snapshot.board, target.position, lockedTarget.position, 1, occupied);
            const next = path?.[Math.min(effect.distance!, path.length) - 1];
            if (next !== undefined) {
              const from = target.position;
              target.position = next;
              markUnitMoved(target);
              emit(tick, "UNIT_DISPLACED", { from, to: next }, source.id, target.id);
            }
            break;
          }
          case "retreat": {
            if (lockedTarget === undefined || (effect.onlyWhenEngaged === true
              && manhattanDistance(snapshot.board, target.position, lockedTarget.position) > target.attackRange)) {
              break;
            }
            const occupied = new Set(runtimeUnits
              .filter((unit) => unit.currentHp > 0 && unit.id !== target.id)
              .map((unit) => unit.position));
            const candidates = sortedNeighbors(snapshot.board, target.position)
              .filter((cell) => !occupied.has(cell))
              .sort((left, right) => {
                const distanceDelta = manhattanDistance(snapshot.board, right, lockedTarget.position) - manhattanDistance(snapshot.board, left, lockedTarget.position);
                return distanceDelta !== 0 ? distanceDelta : left - right;
              });
            const next = candidates[0];
            if (next !== undefined) {
              const from = target.position;
              target.position = next;
              markUnitMoved(target);
              emit(tick, "UNIT_DISPLACED", { from, to: next }, source.id, target.id);
            }
            break;
          }
          case "knockback": {
            if (target.immunities.has("knockback")) {
              break;
            }
            const columns = snapshot.board.columns;
            const sourceRow = Math.floor(source.position / columns);
            const sourceColumn = source.position % columns;
            const targetRow = Math.floor(target.position / columns);
            const targetColumn = target.position % columns;
            const direction = targetRow === sourceRow
              ? Math.sign(targetColumn - sourceColumn)
              : Math.sign(targetRow - sourceRow) * columns;
            let destination = target.position;
            for (let step = 1; step <= effect.distance!; step += 1) {
              const candidate = target.position + direction * step;
              const blocked = runtimeUnits.some(
                (unit) => unit.currentHp > 0 && unit.id !== target.id && unit.position === candidate,
              );
              const crossesRow = Math.abs(direction) === 1 && Math.floor(candidate / columns) !== targetRow;
              if (candidate < 0 || candidate >= boardCellCount(snapshot.board) || crossesRow || blocked) {
                break;
              }
              destination = candidate;
            }
            if (destination !== target.position) {
              const from = target.position;
              target.position = destination;
              markUnitMoved(target);
              emit(tick, "UNIT_DISPLACED", { from, to: destination }, source.id, target.id);
            }
            break;
          }
          case "summon": {
            const activeSummons = runtimeUnits.filter(
              (unit) => unit.side === source.side && unit.isSummon && unit.currentHp > 0,
            );
            if (activeSummons.length >= 3) {
              break;
            }
            const position = sortedNeighbors(snapshot.board, source.position).find(
              (cell) => !runtimeUnits.some((unit) => unit.currentHp > 0 && unit.position === cell),
            );
            if (position === undefined) {
              break;
            }
            const definition = effect.summon!;
            const summonMaxHp = effect.scalesWithMaxHp === true
              ? Math.floor((source.maxHp * definition.maxHp) / SCALE)
              : definition.maxHp;
            const spawned = createMutableRuntimeUnit({
              ...source,
              id: `${source.id}:summon:${effect.id}:${sequence}`,
              position,
              maxHp: summonMaxHp,
              attackDamage: 0,
              attackSpeed: 0,
              startingMana: 0,
              maxMana: 1,
              critChance: 0,
              critMultiplier: SCALE,
              skill: undefined,
              immunities: [...source.immunities],
            });
            spawned.isSummon = true;
            spawned.summonExpiresAtTick = tick + definition.durationTicks;
            runtimeUnits.push(spawned);
            emit(tick, "UNIT_SUMMONED", { position }, source.id, spawned.id);
            break;
          }
          case "cleanse":
            for (const modifier of target.modifiers) {
              if (modifier.kind === "debuff" && modifier.cleanseable) {
                changeStat(target, modifier.stat, -modifier.appliedDelta);
              }
            }
            target.modifiers = target.modifiers.filter(
              (modifier) => modifier.kind !== "debuff" || !modifier.cleanseable,
            );
            target.dots = target.dots.filter((dot) => !dot.cleanseable);
            target.slows = target.slows.filter((slow) => !slow.cleanseable);
            emit(tick, "CLEANSE_APPLIED", {}, source.id, target.id);
            break;
          default:
            throw new Error(`Effect primitive ${effect.primitive} has no executor yet`);
        }
      }
    }
  };

  emit(0, "COMBAT_STARTED", {
    combatId: snapshot.combatId,
    contentVersion: snapshot.contentVersion,
    rulesetVersion: snapshot.rulesetVersion,
  });
  for (const unit of snapshot.units) {
    emit(0, "UNIT_SPAWNED", { side: unit.side, position: unit.position }, unit.id);
  }

  const runtimeUnits = snapshot.units.map(createMutableRuntimeUnit);
  const passiveRuntime = new Map<string, { fired: boolean; nextEligibleTick: number; basicAttackCount: number; stationaryTicks: number }>();
  const dispatchPassives = (
    tick: number,
    trigger: CombatPassive["trigger"],
    source: MutableRuntimeUnit,
    lockedTarget: MutableRuntimeUnit | undefined,
    context: { readonly damageDealt?: number; readonly basicAttack?: boolean } = {},
  ): void => {
    for (const passive of source.passives) {
      if (passive.trigger !== trigger) continue;
      const stateKey = passive.oncePerOwnerPerCombat === true
        ? `${source.side}:${passive.ownerId}:${passive.triggerId}`
        : `${source.id}:${passive.ownerId}:${passive.triggerId}`;
      const state = passiveRuntime.get(stateKey) ?? { fired: false, nextEligibleTick: 0, basicAttackCount: 0, stationaryTicks: 0 };
      passiveRuntime.set(stateKey, state);
      if (state.fired || tick < state.nextEligibleTick) continue;
      if (trigger === "on_hp_below" && (passive.thresholdPercent === undefined || source.currentHp * SCALE > source.maxHp * passive.thresholdPercent)) continue;
      if (trigger === "on_damage_dealt" && passive.basicOnly === true && context.basicAttack !== true) continue;
      if (trigger === "on_every_nth_basic_attack") {
        state.basicAttackCount += 1;
        if (passive.attackCount === undefined || state.basicAttackCount < passive.attackCount) continue;
        state.basicAttackCount = 0;
      }
      if (trigger === "on_stationary_interval") {
        if (source.movedThisTick) {
          state.stationaryTicks = 0;
          continue;
        }
        state.stationaryTicks += 1;
        if (passive.stationaryIntervalTicks === undefined || state.stationaryTicks % passive.stationaryIntervalTicks !== 0) continue;
      }
      if (passive.oncePerCombat === true) state.fired = true;
      if (passive.cooldownTicks !== undefined) state.nextEligibleTick = tick + passive.cooldownTicks;
      if (passive.lifestealPerThousand !== undefined && context.damageDealt !== undefined) {
        const amount = Math.floor((context.damageDealt * passive.lifestealPerThousand) / SCALE);
        source.currentHp = Math.min(source.maxHp, source.currentHp + amount);
        emit(tick, "HEAL_APPLIED", { amount, remainingHp: source.currentHp }, source.id, source.id);
      } else {
        executeEffects(tick, source, lockedTarget, passive.effects, passive.ownerId);
      }
    }
  };
  const selectedTargets = new Map<string, string>();
  const finalTick = snapshot.maxTicks ?? MAX_COMBAT_TICKS;
  const rng = createSeededRng(snapshot.combatSeed);
  let reason: CombatResult["reason"] = "timeout";
  let winner: CombatSide = snapshot.defenderSide ?? "enemy";

  for (const unit of sortUnitsById(runtimeUnits)) dispatchPassives(0, "on_combat_start", unit, undefined);

  combat: for (let tick = 1; tick <= finalTick; tick += 1) {
    for (const unit of runtimeUnits) unit.movedThisTick = false;
    for (const unit of runtimeUnits) {
      if (
        unit.isSummon &&
        unit.summonExpiresAtTick !== undefined &&
        unit.summonExpiresAtTick <= tick &&
        unit.currentHp > 0
      ) {
        unit.currentHp = 0;
        emit(tick, "SUMMON_EXPIRED", {}, unit.id);
      }
      unit.shields = unit.shields.filter((shield) => shield.expiresAtTick > tick && shield.value > 0);
      unit.damageReductions = unit.damageReductions.filter((reduction) => reduction.expiresAtTick > tick);
      for (const modifier of unit.modifiers) {
        if (modifier.expiresAtTick <= tick) {
          changeStat(unit, modifier.stat, -modifier.appliedDelta);
        }
      }
      unit.modifiers = unit.modifiers.filter((modifier) => modifier.expiresAtTick > tick);
      for (const dot of unit.dots) {
        if (dot.nextTick !== tick || dot.expiresAtTick <= tick || unit.currentHp <= 0) {
          continue;
        }
        const source = runtimeUnits.find((candidate) => candidate.id === dot.sourceUnitId);
        applyDamage(tick, source, unit, dot.value, dot.damageType);
        dot.nextTick += dot.intervalTicks;
      }
      unit.dots = unit.dots.filter((dot) => dot.expiresAtTick > tick && unit.currentHp > 0);
    }
    const dotWinner = survivingWinner();
    if (dotWinner !== undefined) {
      winner = dotWinner;
      reason = "elimination";
      break combat;
    }
    const unitsById = new Map(runtimeUnits.filter((unit) => unit.currentHp > 0).map((unit) => [unit.id, unit]));
    const orderedUnits = [...unitsById.values()].sort((left, right) => compareStrings(left.id, right.id));

    for (const unit of orderedUnits) {
      if (unit.currentHp <= 0) {
        continue;
      }
      if (unit.stunnedUntilTick > tick) {
        continue;
      }

      const occupiedPositions = runtimeUnits
        .filter((candidate) => candidate.currentHp > 0)
        .map((candidate) => candidate.position);
      const priorTargetId = selectedTargets.get(unit.id);
      const priorTarget = priorTargetId === undefined ? undefined : unitsById.get(priorTargetId);
      const selectedTarget =
        priorTarget !== undefined && priorTarget.currentHp > 0 && priorTarget.side !== unit.side
          ? priorTarget
          : selectNearestTarget(snapshot.board, unit, runtimeUnits, occupiedPositions);
      const target = selectedTarget === undefined ? undefined : unitsById.get(selectedTarget.id);

      if (target === undefined) {
        continue;
      }
      if (target.id !== priorTargetId) {
        selectedTargets.set(unit.id, target.id);
        emit(tick, "TARGET_SELECTED", { targetId: target.id }, unit.id, target.id);
      }

      if (unit.castRemainingTicks > 0) {
        unit.castRemainingTicks -= 1;
        if (unit.castRemainingTicks === 0 && unit.castTargetId !== undefined) {
          const castTarget = unitsById.get(unit.castTargetId);
          emit(tick, "CAST_RESOLVED", { skillId: unit.skill?.id ?? "unknown" }, unit.id, unit.castTargetId);
          executeEffects(tick, unit, castTarget, unit.skill?.effects ?? []);
          dispatchPassives(tick, "on_cast_resolve", unit, castTarget);
          unit.castTargetId = undefined;
          const immediateWinner = survivingWinner();
          if (immediateWinner !== undefined) {
            winner = immediateWinner;
            reason = "elimination";
            break combat;
          }
        }
        continue;
      }

      if (unit.skill !== undefined && unit.mana >= unit.maxMana) {
        unit.mana = 0;
        unit.castRemainingTicks = unit.skill.castTimeTicks;
        unit.castTargetId = target.id;
        emit(tick, "CAST_STARTED", { skillId: unit.skill.id }, unit.id, target.id);
        continue;
      }

      const path = findPathToRange(snapshot.board, unit.position, target.position, unit.attackRange, occupiedPositions);
      const nextPosition = path?.[0];
      if (nextPosition !== undefined) {
        const slow = Math.min(900, unit.slows.reduce((maximum, item) => Math.max(maximum, item.value), 0));
        unit.moveMeter += Math.floor((unit.moveSpeed * (SCALE - slow)) / SCALE);
        if (unit.moveMeter >= SCALE) {
          unit.moveMeter -= SCALE;
          const from = unit.position;
          unit.position = nextPosition;
          markUnitMoved(unit);
          emit(tick, "UNIT_MOVED", { from, to: nextPosition }, unit.id, target.id);
        }
      }

      if (manhattanDistance(snapshot.board, unit.position, target.position) > unit.attackRange) {
        continue;
      }

      unit.attackMeter += unit.attackSpeed;
      if (unit.attackMeter < 20 * SCALE) {
        continue;
      }
      unit.attackMeter -= 20 * SCALE;

      const isCritical = rng.nextInt(SCALE) < Math.min(SCALE, unit.critChance);
      const rawDamage = isCritical
        ? Math.floor((unit.attackDamage * unit.critMultiplier) / SCALE)
        : unit.attackDamage;
      emit(tick, "BASIC_ATTACK", { isCritical }, unit.id, target.id);
      const damageDealt = applyDamage(tick, unit, target, rawDamage, "physical", true);
      dispatchPassives(tick, "on_basic_attack", unit, target);
      dispatchPassives(tick, "on_every_nth_basic_attack", unit, target);
      if (isCritical) dispatchPassives(tick, "on_critical_basic_attack", unit, target);
      dispatchPassives(tick, "on_damage_dealt", unit, target, { damageDealt, basicAttack: true });
      const immediateWinner = survivingWinner();
      if (immediateWinner !== undefined) {
        winner = immediateWinner;
        reason = "elimination";
        break combat;
      }
    }

    for (const unit of sortUnitsById(runtimeUnits.filter((candidate) => candidate.currentHp > 0))) {
      dispatchPassives(tick, "on_stationary_interval", unit, undefined);
    }
  }

  if (reason === "timeout") {
    winner = timeoutWinner();
  }

  const endedAtTick = reason === "elimination" ? events.at(-1)?.tick ?? finalTick : finalTick;
  emit(endedAtTick, "COMBAT_ENDED", { reason, winner });

  const units = Object.freeze(
    runtimeUnits
      .sort((left, right) => compareStrings(left.id, right.id))
      .map((unit) =>
        Object.freeze({
          id: unit.id,
          side: unit.side,
          isSummon: unit.isSummon,
          position: unit.position,
          currentHp: unit.currentHp,
          mana: unit.mana,
          attackMeter: unit.attackMeter,
        }),
      ),
  );
  const immutableEvents = Object.freeze(events);
  const resultHash = fnv1a64Hex(
    stableStringify({
      combatId: snapshot.combatId,
      events: immutableEvents,
      finalTick: endedAtTick,
      units,
      winner,
    }),
  );

  return Object.freeze({
    events: immutableEvents,
    finalTick: endedAtTick,
    reason,
    resultHash,
    units,
    winner,
  });
}
