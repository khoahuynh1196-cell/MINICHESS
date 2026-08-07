export type HeroStars = 1 | 2 | 3;
export type AdventureItemKind = "normal" | "unique";

export interface AdventureHeroInstance {
  readonly instanceId: string;
  readonly heroId: string;
  readonly cost: number;
  readonly stars: HeroStars;
  /** Number of shared-pool copies represented by this instance. Reward heroes may represent zero. */
  readonly poolCopies: number;
  /** Stable order used for deterministic merge/survivor selection. */
  readonly acquisitionOrder: number;
}

export interface AdventureItemInstance {
  readonly instanceId: string;
  readonly itemId: string;
  readonly kind: AdventureItemKind;
  readonly equippedHeroInstanceId?: string;
}

export interface AdventureRoster {
  readonly board: readonly (AdventureHeroInstance | null)[];
  readonly bench: readonly (AdventureHeroInstance | null)[];
  readonly items: readonly AdventureItemInstance[];
}

export type RosterLocationKind = "board" | "bench";

export interface RosterDestination {
  readonly kind: RosterLocationKind;
  readonly index: number;
}

export interface LocatedHero {
  readonly kind: RosterLocationKind;
  readonly index: number;
  readonly hero: AdventureHeroInstance;
}

export type AdventurePhase = "PREPARE" | "COMBAT" | "PLAYBACK" | "REWARD" | "COMPLETE";

export interface AdventureShopSlot {
  readonly heroId: string;
  readonly cost: number;
  readonly rarity: 1 | 2 | 3 | 4 | 5;
}

export interface AdventureRunState extends AdventureRoster {
  readonly id: string;
  readonly revision: number;
  readonly phase: AdventurePhase;
  readonly rulesetVersion: string;
  readonly contentVersion: string;
  readonly round: number;
  readonly gold: number;
  readonly health: number;
  readonly level: number;
  readonly experience: number;
  readonly shop: readonly (AdventureShopSlot | null)[];
  readonly shopLocked: boolean;
  readonly freeRefreshes: number;
  /** Hero rewards wait here until the player makes bench space during PREPARE. */
  readonly rewardHeroes: readonly AdventureHeroInstance[];
}
