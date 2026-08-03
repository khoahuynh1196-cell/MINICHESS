export interface SeededRng {
  nextUint32(): number;
  nextInt(maxExclusive: number): number;
}

function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;

  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }

  return hash === 0 ? 0x6d2b79f5 : hash >>> 0;
}

/**
 * Xorshift32 is intentionally small and reproducible across Node runtimes.
 * It is not cryptographic; seeds must be generated and derived by the server.
 */
export function createSeededRng(seed: string): SeededRng {
  let state = hashSeed(seed);

  const nextUint32 = (): number => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state;
  };

  return {
    nextUint32,
    nextInt(maxExclusive: number): number {
      if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
        throw new Error("maxExclusive must be a positive safe integer");
      }

      return nextUint32() % maxExclusive;
    },
  };
}
