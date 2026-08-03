# PvE Encounter Content Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add deterministic, validated enemy formations for all eight Alpha PvE encounters.

**Architecture:** Encounter data references existing hero definitions and carries only enemy grid position plus fixed-point multipliers/affix data. `game-core` validates it; no server or client hard-codes a round or hero.

**Tech Stack:** TypeScript strict mode, Vitest, JSON content.

## Global Constraints

- Keep public IDs H01–H20 unchanged.
- All numeric values are safe integers; multipliers use `SCALE = 1000`.
- Enemy positions are unique and in global enemy cells `0..11`.
- Exactly eight consecutive encounters remain; only round four has `unique_reveal`.

---

### Task 1: Type and validate enemy encounter data

**Files:**
- Modify: `game-core/src/content/types.ts`
- Modify: `game-core/src/content/compiler.ts`
- Test: `game-core/test/content/compiler.test.ts`

- [x] Write failing compiler tests for missing hero references, duplicate positions, and invalid multipliers.
- [x] Run `pnpm --filter @auto-battler/game-core exec vitest run test/content/compiler.test.ts` and verify RED.
- [x] Add `enemy_composition` and optional attack-speed affix types; validate all references and integer ranges.
- [x] Re-run the targeted test and `pnpm run check` to verify GREEN.

### Task 2: Seed and verify the eight balanced formations

**Files:**
- Modify: `content/alpha-0.3.0/bundle.json`
- Modify: `game-core/test/content/alpha-bundle.test.ts`

- [x] Write failing bundle assertions for unit counts, monotonic budget progression, legal enemy positions, and the sole round-five affix.
- [x] Run `pnpm --filter @auto-battler/game-core exec vitest run test/content/alpha-bundle.test.ts` and verify RED.
- [x] Add the approved formations and multipliers from the design document.
- [x] Re-run targeted content tests and `pnpm run check` to verify GREEN.
