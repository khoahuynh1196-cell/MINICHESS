import { playerBoardCellCount } from "../rules/board.js";
import type { CompiledRuleset } from "../rules/types.js";
import type {
  AdventureHeroInstance,
  AdventureItemInstance,
  AdventureRoster,
  LocatedHero,
  RosterDestination,
} from "./types.js";

type RosterRulesContract = Pick<CompiledRuleset, "board" | "roster">;

function representedCopies(stars: AdventureHeroInstance["stars"]): number {
  return 3 ** (stars - 1);
}

function assertNonEmpty(value: string, label: string): void {
  if (value.trim().length === 0) throw new Error(`${label} must not be empty`);
}

function assertHero(hero: AdventureHeroInstance): void {
  assertNonEmpty(hero.instanceId, "hero.instanceId");
  assertNonEmpty(hero.heroId, "hero.heroId");
  if (!Number.isSafeInteger(hero.cost) || hero.cost < 0) throw new Error("hero.cost must be a safe integer >= 0");
  if (hero.stars !== 1 && hero.stars !== 2 && hero.stars !== 3) throw new Error("hero.stars must be 1, 2, or 3");
  const maximumCopies = representedCopies(hero.stars);
  if (!Number.isSafeInteger(hero.poolCopies) || hero.poolCopies < 0 || hero.poolCopies > maximumCopies) {
    throw new Error(`hero.poolCopies must be within 0..${maximumCopies}`);
  }
  if (!Number.isSafeInteger(hero.acquisitionOrder) || hero.acquisitionOrder < 0) {
    throw new Error("hero.acquisitionOrder must be a safe integer >= 0");
  }
}

function assertItem(item: AdventureItemInstance): void {
  assertNonEmpty(item.instanceId, "item.instanceId");
  assertNonEmpty(item.itemId, "item.itemId");
  if (item.kind !== "normal" && item.kind !== "unique") throw new Error("item.kind must be normal or unique");
  if (item.equippedHeroInstanceId !== undefined) assertNonEmpty(item.equippedHeroInstanceId, "item.equippedHeroInstanceId");
}

function freezeHero(hero: AdventureHeroInstance): AdventureHeroInstance {
  return Object.freeze({ ...hero });
}

function freezeItem(item: AdventureItemInstance): AdventureItemInstance {
  return Object.freeze({ ...item });
}

export function freezeAdventureRoster(roster: AdventureRoster): AdventureRoster {
  return Object.freeze({
    board: Object.freeze(roster.board.map((hero) => hero === null ? null : freezeHero(hero))),
    bench: Object.freeze(roster.bench.map((hero) => hero === null ? null : freezeHero(hero))),
    items: Object.freeze(roster.items.map(freezeItem)),
  });
}

export function createEmptyAdventureRoster(rules: RosterRulesContract): AdventureRoster {
  return freezeAdventureRoster({
    board: Array(playerBoardCellCount(rules)).fill(null),
    bench: Array(rules.roster.benchSlots).fill(null),
    items: [],
  });
}

export function deployedHeroCount(roster: Pick<AdventureRoster, "board">): number {
  return roster.board.filter((hero) => hero !== null).length;
}

export function locateAdventureHero(roster: AdventureRoster, heroInstanceId: string): LocatedHero | undefined {
  const boardIndex = roster.board.findIndex((hero) => hero?.instanceId === heroInstanceId);
  if (boardIndex >= 0) return Object.freeze({ kind: "board", index: boardIndex, hero: roster.board[boardIndex]! });
  const benchIndex = roster.bench.findIndex((hero) => hero?.instanceId === heroInstanceId);
  if (benchIndex >= 0) return Object.freeze({ kind: "bench", index: benchIndex, hero: roster.bench[benchIndex]! });
  return undefined;
}

export function assertAdventureRoster(
  rules: RosterRulesContract,
  roster: AdventureRoster,
  boardCap: number,
): void {
  if (!Number.isSafeInteger(boardCap) || boardCap < 1 || boardCap > playerBoardCellCount(rules)) {
    throw new Error("boardCap is outside the player board");
  }
  if (roster.board.length !== playerBoardCellCount(rules)) throw new Error("Adventure board length does not match rules");
  if (roster.bench.length !== rules.roster.benchSlots) throw new Error("Adventure bench length does not match rules");
  if (deployedHeroCount(roster) > boardCap) throw new Error("Adventure roster exceeds deployment cap");

  const heroes = [...roster.board, ...roster.bench].filter((hero): hero is AdventureHeroInstance => hero !== null);
  const heroIds = new Set<string>();
  for (const hero of heroes) {
    assertHero(hero);
    if (heroIds.has(hero.instanceId)) throw new Error(`Duplicate hero instance: ${hero.instanceId}`);
    heroIds.add(hero.instanceId);
  }

  const itemIds = new Set<string>();
  const equippedCounts = new Map<string, number>();
  let uniqueCount = 0;
  for (const item of roster.items) {
    assertItem(item);
    if (itemIds.has(item.instanceId)) throw new Error(`Duplicate item instance: ${item.instanceId}`);
    itemIds.add(item.instanceId);
    if (item.kind === "unique") uniqueCount += 1;
    if (item.equippedHeroInstanceId !== undefined) {
      if (!heroIds.has(item.equippedHeroInstanceId)) throw new Error(`Item ${item.instanceId} is equipped to a missing hero`);
      const nextCount = (equippedCounts.get(item.equippedHeroInstanceId) ?? 0) + 1;
      if (nextCount > rules.roster.maxItemsPerHero) throw new Error(`Hero ${item.equippedHeroInstanceId} exceeds item capacity`);
      equippedCounts.set(item.equippedHeroInstanceId, nextCount);
    }
  }
  if (uniqueCount > rules.roster.maxUniquePerTeam) throw new Error("Adventure roster exceeds Unique capacity");
}

function destinationArray(
  board: (AdventureHeroInstance | null)[],
  bench: (AdventureHeroInstance | null)[],
  destination: RosterDestination,
): (AdventureHeroInstance | null)[] {
  return destination.kind === "board" ? board : bench;
}

function assertDestination(rules: RosterRulesContract, destination: RosterDestination): void {
  const maximum = destination.kind === "board" ? playerBoardCellCount(rules) : rules.roster.benchSlots;
  if (!Number.isSafeInteger(destination.index) || destination.index < 0 || destination.index >= maximum) {
    throw new Error(`Invalid ${destination.kind} destination index`);
  }
}

export function moveAdventureHero(
  rules: RosterRulesContract,
  roster: AdventureRoster,
  boardCap: number,
  heroInstanceId: string,
  destination: RosterDestination,
): AdventureRoster {
  assertAdventureRoster(rules, roster, boardCap);
  assertDestination(rules, destination);
  const source = locateAdventureHero(roster, heroInstanceId);
  if (source === undefined) throw new Error(`Adventure hero not found: ${heroInstanceId}`);
  if (source.kind === destination.kind && source.index === destination.index) throw new Error("Adventure hero is already at the destination");

  const board = [...roster.board];
  const bench = [...roster.bench];
  const sourceArray = source.kind === "board" ? board : bench;
  const targetArray = destinationArray(board, bench, destination);
  const displaced = targetArray[destination.index] ?? null;
  sourceArray[source.index] = displaced;
  targetArray[destination.index] = source.hero;

  const moved = freezeAdventureRoster({ board, bench, items: roster.items });
  assertAdventureRoster(rules, moved, boardCap);
  return moved;
}

function unequipNormalItem(item: AdventureItemInstance): AdventureItemInstance {
  const { equippedHeroInstanceId: _equippedHeroInstanceId, ...unequipped } = item;
  return Object.freeze(unequipped);
}

function mergeCandidateOrder(left: LocatedHero, right: LocatedHero): number {
  return left.hero.acquisitionOrder - right.hero.acquisitionOrder
    || left.hero.instanceId.localeCompare(right.hero.instanceId)
    || left.kind.localeCompare(right.kind)
    || left.index - right.index;
}

function mergeSurvivorOrder(left: LocatedHero, right: LocatedHero): number {
  const locationDelta = (left.kind === "board" ? 0 : 1) - (right.kind === "board" ? 0 : 1);
  return locationDelta || mergeCandidateOrder(left, right);
}

function locatedHeroes(board: readonly (AdventureHeroInstance | null)[], bench: readonly (AdventureHeroInstance | null)[]): LocatedHero[] {
  return [
    ...board.flatMap((hero, index) => hero === null ? [] : [{ kind: "board" as const, index, hero }]),
    ...bench.flatMap((hero, index) => hero === null ? [] : [{ kind: "bench" as const, index, hero }]),
  ].sort(mergeCandidateOrder);
}

export function mergeAdventureRoster(
  rules: RosterRulesContract,
  roster: AdventureRoster,
  boardCap: number,
): AdventureRoster {
  assertAdventureRoster(rules, roster, boardCap);
  let board = [...roster.board];
  let bench = [...roster.bench];
  let items = [...roster.items];

  for (const stars of [1, 2] as const) {
    for (;;) {
      const candidates = locatedHeroes(board, bench).filter((entry) => entry.hero.stars === stars);
      const heroId = candidates.find((entry) =>
        candidates.filter((candidate) => candidate.hero.heroId === entry.hero.heroId).length >= 3)?.hero.heroId;
      if (heroId === undefined) break;

      const group = candidates.filter((entry) => entry.hero.heroId === heroId).sort(mergeCandidateOrder);
      const uniqueHolderId = items.find((item) => item.kind === "unique"
        && item.equippedHeroInstanceId !== undefined
        && group.some((entry) => entry.hero.instanceId === item.equippedHeroInstanceId))?.equippedHeroInstanceId;
      const uniqueHolder = uniqueHolderId === undefined ? undefined : group.find((entry) => entry.hero.instanceId === uniqueHolderId);
      const selected = uniqueHolder === undefined
        ? group.slice(0, 3)
        : [uniqueHolder, ...group.filter((entry) => entry.hero.instanceId !== uniqueHolder.hero.instanceId).slice(0, 2)];
      const survivor = [...selected].sort(mergeSurvivorOrder)[0]!;
      const selectedIds = new Set(selected.map((entry) => entry.hero.instanceId));
      const mergedHero: AdventureHeroInstance = Object.freeze({
        ...survivor.hero,
        stars: (stars + 1) as 2 | 3,
        poolCopies: selected.reduce((total, entry) => total + entry.hero.poolCopies, 0),
      });

      board = board.map((hero) => hero !== null && selectedIds.has(hero.instanceId) ? null : hero);
      bench = bench.map((hero) => hero !== null && selectedIds.has(hero.instanceId) ? null : hero);
      if (survivor.kind === "board") board[survivor.index] = mergedHero;
      else bench[survivor.index] = mergedHero;

      items = items.map((item) => {
        if (item.equippedHeroInstanceId === undefined || !selectedIds.has(item.equippedHeroInstanceId)) return item;
        if (item.kind === "unique") return Object.freeze({ ...item, equippedHeroInstanceId: mergedHero.instanceId });
        return unequipNormalItem(item);
      });
    }
  }

  const merged = freezeAdventureRoster({ board, bench, items });
  assertAdventureRoster(rules, merged, boardCap);
  return merged;
}
