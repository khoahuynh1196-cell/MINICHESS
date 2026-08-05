# Online Auto-Battler Production Program Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the approved eight-player online auto-battler as a sequence of independently verifiable production gates, ending with a staged Google Play release.

**Architecture:** Preserve the deterministic TypeScript combat core while replacing conflicting rules with one versioned ruleset, then rebuild Adventure and the Godot presentation before introducing identity, realtime rooms, matchmaking, ranked systems, and production operations. Each gate freezes interfaces and evidence used by the next gate; later subsystems may not bypass an earlier acceptance gate.

**Tech Stack:** TypeScript 5.9, Node.js 22+, pnpm 11, Vitest 4, Fastify 5, PostgreSQL, Redis, Godot 4.7+, GDScript, Android App Bundle, Google Play Games Services, Play Integrity, object storage/CDN.

## Global Constraints

- Keep H01–H20 and U01–U06; do not add launch heroes before the retained roster passes all quality gates.
- Use one 4-column × 8-row rectangular board: enemy rows `0..3`, player rows `4..7`, grid index `row * 4 + column`.
- Use a five-slot shop, eight bench slots, level cap 9, and deployment cap 8.
- Keep combat, RNG, shop, economy, pairings, placement, rank, and achievements server-authoritative.
- Godot is presentation-only and may emit intents but may not resolve gameplay outcomes.
- Every active match locks `ruleset_version`, `content_version`, and `asset_bundle_version`.
- Launch modes are Adventure PvE, Normal, and Ranked; Ranked requires eight human players.
- Launch monetization is cosmetic-only.
- Production Android delivery is a signed `.aab`; debug APK export is not release evidence.
- No gate is complete without fresh automated verification and its named manual/device evidence.

---

## Program decomposition

The master specification spans multiple independent systems. Implementation is split into eight plans. The exact reserved plan paths are listed below. A plan is expanded and reviewed immediately before its gate begins, using the interfaces and verification evidence produced by the preceding gate.

```text
Gate 0  Canonical rules and migration foundation
   ↓
Gate 1  Complete Adventure and Godot scene rebuild
   ↓
Gate 2  Combat presentation and full asset/audio remake
   ↓
Gate 3  Identity, profile, endpoint, and realtime foundation
   ↓
Gate 4  Eight-player room, matchmaking, and Normal mode
   ↓
Gate 5  Ranked, seasons, achievements, and match history
   ↓
Gate 6  Production hardening, load, security, admin, and compliance
   ↓
Gate 7  Google Play testing and staged release
```

## Repository target structure

```text
/rules
  /production-0.1.0/ruleset.json
/content
  /production-0.1.0/bundle.json
/game-core/src
  /rules
  /simulation
  /effects
  /content
  /compatibility
/server/src
  /modules/identity
  /modules/profile
  /modules/content
  /modules/matchmaking
  /modules/match-room
  /modules/combat
  /modules/ranking
  /modules/achievement
  /modules/history
  /modules/admin
  /modules/telemetry
  /infrastructure/postgres
  /infrastructure/redis
  /workers/room
  /workers/combat
/client-godot
  /scenes/app
  /scenes/screens
  /scenes/match
  /scenes/components
  /scripts/app
  /scripts/network
  /scripts/presenters
  /scripts/animation
  /scripts/audio
  /scripts/assets
  /assets/rules
  /assets/content
  /assets/bundles
/infra
  /docker
  /migrations
  /load-tests
  /observability
/tools
/docs/superpowers/plans
```

Existing folders remain until their behavior is migrated and parity-tested. Deleting legacy code is a final step in the gate that replaces it, never an opening cleanup step.

---

## Gate 0 — Canonical rules and migration foundation

**Detailed plan:** `docs/superpowers/plans/2026-08-06-gate-0-canonical-rules-migration.md`

**Produces:**

- Authored `production-rules-0.1.0` ruleset and stable hash.
- One shared 4×8 board geometry across game-core, server, content, fixtures, and Godot.
- Rules-driven Adventure progression, shop, economy, item, and Unique limits.
- Client-safe generated rules projection and drift check.
- Content/rules compatibility validation.
- Tagged Alpha code baseline.

**Acceptance gate:**

- All TypeScript and Godot tests pass against the generated rules projection.
- No production board/shop/progression constant remains independently hardcoded in audited paths.
- A deterministic replay remains stable for repeated identical 4×8 snapshots.
- Adventure API creates a 16-cell player board and five-slot shop using the production ruleset.

---

## Gate 1 — Complete Adventure and Godot scene rebuild

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-1-adventure-client-rebuild.md`

**Produces:**

- `production-0.1.0` content bundle retaining H01–H20 and U01–U06.
- Complete eight-round Adventure economy, shop, XP, merge, item, trait, transformation, reward, boss, recap, and resume flow.
- `.tscn`-based Boot, Home, Adventure Map, Prepare, Combat, Reward, Recap, Collection, and Settings screens.
- Decomposition of `battle_controller.gd` into app, Adventure, prepare, combat, and asset presenters.
- Environment-aware desktop, Android emulator, staging, and production endpoints.
- Signed debug install evidence on emulator and at least one physical Android device.

**Acceptance gate:**

- A fresh install can win or lose the full Adventure without developer controls.
- All visible actions work or explain why they are disabled.
- No client action mutates combat, rewards, shop RNG, or currency locally.
- Save/resume works across PREPARE, COMBAT playback, and REWARD.

---

## Gate 2 — Combat presentation and full asset/audio remake

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-2-combat-presentation-assets.md`

**Produces:**

- Presentation-complete combat event schema with action, release, and impact timing.
- Godot combat timeline, actor state priority, pooled projectiles/VFX/numbers, and server-clock playback.
- Five species rigs, five role timing profiles, and per-hero overrides for H01–H20.
- Distinct runtime rig art, shop portrait, collection portrait, ability icon, status treatment, and transformation treatment.
- Four biome boards, sixteen monster roles, UI kit, VFX kit, SFX, and music buses.
- Asset bundle compiler, hash, compatibility manifest, and CDN-ready package.

**Acceptance gate:**

- HP changes, hit reactions, and deaths occur at authoritative impact/death events.
- Test users can identify key casts, control effects, deaths, and likely loss causes at normal phone scale.
- No rejected multi-purpose card/cutout is used as final board, portrait, and ability art simultaneously.
- Reference device reaches the defined frame/memory target in an eight-unit-versus-eight-unit stress combat.

---

## Gate 3 — Identity, profile, endpoint, and realtime foundation

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-3-identity-realtime-foundation.md`

**Produces:**

- Guest accounts, Google Play Games linking contract, access/refresh token rotation, revocation, and account deletion foundation.
- Profiles, player settings, cosmetics inventory shell, and Adventure completion state.
- HTTPS API modules and versioned WebSocket protocol.
- Realtime sequencing, ping/pong, server-clock synchronization, reconnect state machine, and supported-build checks.
- PostgreSQL migrations for identity/profile/session/content releases.
- Redis presence and connection routing foundation.

**Acceptance gate:**

- A guest can authenticate, refresh, reconnect, link identity without data loss, and revoke/delete the account.
- Cross-account access tests fail closed.
- Client survives socket loss and restores a synthetic room snapshot without duplicate commands.

---

## Gate 4 — Eight-player room, matchmaking, and Normal mode

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-4-eight-player-normal.md`

**Produces:**

- Matchmaking tickets, region/mode queue, configurable Normal bot fill, match acceptance, and cancellation.
- Single-writer match room with lease/fencing token, phase deadlines, eight seats, shared pool, economy, pairing, ghosts, elimination, spectate, and results.
- Combat worker idempotency by combat ID and snapshot hash.
- Match events, phase snapshots, room recovery, and rolling deploy drain behavior.
- Godot Queue, Match HUD, opponent list, spectate, and Normal result screens.

**Acceptance gate:**

- Eight automated clients/bots complete repeated matches with no pool leak, duplicate mutation, or result divergence.
- Killing the active room worker at every phase boundary recovers the same match and final placement.
- A disconnected player reconnects to the same seat and receives missing state/events only once.

---

## Gate 5 — Ranked, seasons, achievements, and match history

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-5-ranked-progression.md`

**Produces:**

- Eight-human Ranked queue and integrity policy.
- Pairwise placement MMR, visible LP/tier, calibration, season reset, regional leaderboard, and idempotent rating transactions.
- Authoritative achievements, incremental progress, cosmetic rewards, and Google Play mapping.
- Match history with final composition, traits, items, Unique holder, statistics, versions, and result hash.
- Rank, history, achievement, and profile UI.

**Acceptance gate:**

- Retrying match completion never applies rating, achievement, or rewards twice.
- Ranked contains no rating-affecting bots.
- Season versions stay locked for active matches.
- Leaderboard and profile values reconcile with rating transactions.

---

## Gate 6 — Production hardening, load, security, admin, and compliance

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-6-production-hardening.md`

**Produces:**

- Load/soak/chaos suites to at least 1,000 CCU equivalent and 125 concurrent rooms.
- Rate limiting, Play Integrity policy, abuse telemetry, audit logs, and support/admin workflows.
- Metrics, logs, traces, crash correlation, dashboards, alerts, and emergency queue/content disable.
- Privacy policy inputs, Data Safety inventory, retention/deletion jobs, and account deletion route.
- Backup/restore, migration rollback, disaster recovery, and server/client compatibility policy.

**Acceptance gate:**

- Load, recovery, security, privacy, and operational runbooks have fresh evidence.
- Result hash mismatch count is zero.
- Crash-free session and device performance targets are met on the release candidate.
- A corrupt content release can be prevented from creating new matches without terminating active matches.

---

## Gate 7 — Google Play testing and staged release

**Reserved plan path:** `docs/superpowers/plans/2026-08-06-gate-7-google-play-release.md`

**Produces:**

- Release signing, Android App Bundle, API target, versioning, Play App Signing, and CI upload pipeline.
- Internal, closed, open, and production track configuration.
- Store listing, screenshots, feature graphic, trailer, content rating, privacy, Data Safety, and deletion link.
- Google Play Games production IDs and Play Integrity production configuration.
- Staged rollout, rollback, client-support window, and launch monitoring.

**Acceptance gate:**

- Closed testing and production-access requirements are satisfied.
- Production `.aab` installs from Play, authenticates, completes Adventure, enters a real online match, reconnects, and records one result.
- Staged rollout dashboards and rollback procedure are active before expansion.

---

## Program execution rules

1. Execute only the currently approved detailed gate plan.
2. Use a dedicated worktree/branch for implementation.
3. Every feature or bugfix begins with a failing focused test.
4. Each task ends with focused verification and an intentional commit.
5. Request code review at each task and gate boundary.
6. Do not create Gate N+1 implementation code before Gate N acceptance evidence exists.
7. Generated rules/content/asset files must be reproducible and checked for drift in CI.
8. A test count in documentation is updated only from fresh command output.
9. Device/performance claims require device/performance logs, not desktop inference.
10. Any master-design change must update the approved specification before changing a detailed plan.
