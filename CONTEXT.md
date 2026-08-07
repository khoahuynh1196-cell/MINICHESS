# MINICHESS / Auto-Battler — Agent Execution Context

This file is the project-level operating contract for autonomous coding agents, including Google Antigravity.

## 1. Current product goal

Build a strong, production-oriented **offline-first Android auto-battler foundation** before online systems.

The priority order is:

1. Canonical rules and deterministic simulation.
2. Complete Adventure gameplay domain.
3. Production 4×8 combat engine and replay/presentation events.
4. Godot architecture and mobile UX.
5. Art/animation/VFX/audio pipeline.
6. Full offline Android vertical slice.
7. Only after the above: auth, realtime rooms, matchmaking, ranked, seasons, achievements, anti-cheat, and scale.

Do not pull online work forward merely because the existing server directory exists.

## 2. Repository starting point

Primary development branch for this foundation:

`codex/gate-0-canonical-rules`

The branch is represented by PR #3 against `feature/auto-battler-alpha`.

Before modifying code, read:

- `docs/superpowers/plans/2026-08-07-offline-foundation-execution.md`
- `docs/evidence/offline-foundation-progress.md`
- `docs/superpowers/plans/2026-08-07-antigravity-offline-foundation-handoff.md`
- `rules/production-0.1.0/ruleset.json`
- `releases/offline-foundation-0.1.0/release.json`

Do not assume the old Alpha documentation is authoritative when it conflicts with the production ruleset.

## 3. Locked gameplay contracts

- H01–H20 remain the launch roster.
- U01–U06 remain the Unique Transformation set.
- Production board: 4 columns × 8 rows.
- Enemy global cells: 0..15.
- Player global cells: 16..31.
- Player formation storage: 16 local cells.
- Shop: exactly 5 slots.
- Bench: exactly 8 slots.
- Player level: 3 through 9.
- Maximum deployed heroes: 8.
- Star upgrades: 3 copies → 2-star; 9 total copies → 3-star.
- A hero holds at most 2 items.
- A team owns at most 1 Unique.
- Adventure has 8 rounds.
- Adventure starts with 30 HP and 8 gold.
- The authored ruleset owns progression, economy, board geometry, loss damage, shop odds, and limits.

Never duplicate those values as independent production constants in server or Godot code.

## 4. Authority boundaries

### TypeScript game-core owns gameplay truth

`game-core` owns:

- rules compilation;
- deterministic RNG;
- shop pool accounting;
- roster and item invariants;
- progression/economy;
- command revision/idempotency;
- Adventure lifecycle;
- combat snapshot construction;
- combat outcome;
- replay/presentation event semantics;
- save-state validation.

### Godot is a client/presenter

Godot may:

- display public state;
- collect user intent;
- play authoritative combat events;
- animate visuals;
- persist through the approved runtime/session adapter.

Godot must not independently calculate:

- shop rolls;
- gold or XP mutation;
- star merge results;
- combat damage;
- targeting outcomes;
- reward outcomes;
- winner/loser;
- ruleset defaults.

### Server is currently an adapter/deferred online layer

Do not move new core gameplay rules into Fastify/Postgres while the offline foundation is the current priority.

## 5. Version and compatibility policy

The playable release locks:

- `ruleset.version` + rules hash;
- `content.version` + content hash;
- asset revision;
- client/save schema.

A version/hash mismatch must fail closed with an explicit error. Do not silently fall back to Alpha constants.

`alpha-0.3.0` must preserve its historical meaning. If content coordinates or behavior must change for production, create a new version rather than silently rewriting Alpha history.

## 6. Legacy combat policy

The current legacy simulation kernel still contains 3×8 assumptions.

Rules:

1. Do not treat the legacy 3×8 kernel as the production engine.
2. Do not spread new `/3`, `%3`, `±3`, or 24-cell assumptions.
3. Production combat must consume explicit 4×8 geometry from the locked rules/snapshot contract.
4. Legacy replay compatibility may remain behind a clearly named legacy adapter.
5. Do not delete the legacy implementation until regression/golden evidence proves the production replacement and any required historical replay behavior.

## 7. Combat presentation policy

Outcome and presentation must remain separated but consistent.

The combat engine must produce:

- authoritative outcome;
- deterministic playback event log tied to the exact combat snapshot.

Playback events must retain:

- contiguous sequence;
- nondecreasing tick;
- action identity;
- source/target identity where applicable;
- source/target position where applicable;
- animation key where applicable;
- release tick where applicable;
- impact tick where applicable;
- deterministic event-log hash.

Displayed HP may change only on the authoritative impact event. Death may play only after the authoritative death event.

## 8. Save/resume policy

Save state must be:

- checksummed;
- release/version locked;
- invariant validated;
- atomic from the session point of view.

A failed save must not publish a new accepted in-memory state.

Combat playback must eventually support restart/resume without rerunning the simulation or duplicating rewards. Prefer a persisted playback/replay contract over rerunning combat.

## 9. Code-quality rules

- Prefer small modules with one responsibility.
- Prefer pure functions in game-core.
- Do not add a new God-object controller.
- Do not add hero-ID-specific gameplay branches such as `if (heroId === "H01")`.
- Put hero/trait/item differences in versioned content and generic effect primitives.
- Do not edit generated client rules by hand; regenerate them from the authored rules source.
- Avoid broad rewrites when a focused migration can preserve validated behavior.
- Do not delete legacy code before parity evidence exists.

## 10. Test and verification rules

Every behavior change follows this order:

1. Add or identify a focused failing test.
2. Run the focused test and confirm the expected failure.
3. Implement the minimum correct change.
4. Run the focused test to green.
5. Run impacted package tests.
6. Run `pnpm run check` before claiming a TypeScript/domain gate is complete.
7. Run the Godot headless regression suite before claiming a Godot gate is complete.
8. For Android/device claims, use emulator/physical-device evidence; desktop inference is not acceptable.

Never say "done", "fixed", "passing", or "playable" without fresh command evidence.

## 11. Commit discipline

- Work on an isolated branch/worktree created from the latest `codex/gate-0-canonical-rules` head.
- One meaningful mission/task per commit or small coherent commit series.
- Do not mix art/UI redesign with combat-engine migration in the same commit.
- Keep the branch buildable at each accepted mission gate.
- Update `docs/evidence/offline-foundation-progress.md` only with evidence actually produced.

## 12. Scope-stop rules

Do not implement these until the offline vertical slice gate passes:

- account/auth;
- cloud save;
- WebSocket protocol;
- Redis;
- matchmaking;
- eight-player rooms;
- ranked/MMR/LP;
- seasons;
- achievements;
- leaderboard;
- live-service monetization;
- production anti-cheat.

If a task appears to require one of those systems, first prove why the offline domain cannot expose an interface for it later.

## 13. Agent operating mode

Before coding, perform a repository audit and write/update an implementation plan. Do not immediately code from a one-line prompt.

Work sequentially through the Antigravity handoff plan. Do not start a later mission when an earlier mission has a load-bearing failing test.

At the end of each mission report:

- files changed;
- commands run;
- exact pass/fail summary;
- commit SHA(s);
- unresolved risks/debt;
- the next mission that is now unblocked.
