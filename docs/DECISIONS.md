# Architecture Decision Record

This document records decisions that are locked for the Alpha build. Changing a
decision requires a new dated entry explaining the impact on contracts, tests,
and migrations.

## ADR-001 — Workspace and language

**Status:** Accepted — 2026-08-03

- The repository root is `D:\CODE`.
- The backend and shared game core use TypeScript in strict mode.
- Package management and workspace orchestration use pnpm.
- The Godot client uses GDScript and consumes only versioned API payloads and
  combat events. It does not execute authoritative combat logic.

**Why:** TypeScript allows the server and headless combat core to share exact
data contracts. Godot remains focused on input, presentation, audio, and
animation.

## ADR-002 — HTTP framework and delivery model

**Status:** Accepted — 2026-08-03

- The server uses Fastify.
- Alpha uses HTTPS JSON request/response commands. WebSocket support is out of
  scope until real-time PvP is approved.
- Commands are authenticated, tenant-scoped, versioned, and include a client
  generated `command_id` for idempotency.

**Why:** Fastify keeps the Alpha small and testable while leaving a clean path
to workers and future real-time adapters.

## ADR-003 — Authoritative simulation and determinism

**Status:** Accepted — 2026-08-03

- `game-core` runs only on the server and in headless test/balance tools.
- Combat uses a fixed 20 Hz tick and integer fixed-point values; no simulation
  decision may depend on JavaScript floating-point arithmetic.
- A combat result is defined by immutable `content_version`, `ruleset_version`,
  canonical locked snapshot, and server-generated `combat_seed`.
- All collections that affect simulation are explicitly sorted by stable IDs;
  ties use the ruleset's stated tie-breakers.
- The client renders received combat events at 60 FPS using interpolation.

**Why:** Server authority blocks client-side reward manipulation, and fixed
point plus canonical ordering makes replay and desync detection practical.

## ADR-004 — Identity, tenancy, and data access

**Status:** Accepted — 2026-08-03

- Supabase Auth owns player authentication.
- PostgreSQL is the system of record. Supabase Row Level Security is enabled on
  every tenant-owned table.
- Each new player receives one personal tenant. Future shared tenants use the
  same `tenants` and `tenant_memberships` model.
- Every tenant-owned command verifies authenticated membership and derives
  `tenant_id` from the server-side session; the client may never choose it.
- Currency, reward, run state, command, and audit records are tenant-scoped.

**Why:** This establishes isolation before social or business features add more
tenant types.

## ADR-005 — Persistence and rewards

**Status:** Accepted — 2026-08-03

- A run is an aggregate controlled by the server state machine:
  `PREPARE -> VALIDATE -> LOCK_SNAPSHOT -> SPAWN -> COUNTDOWN -> COMBAT ->
  RESOLVE -> REWARD -> PERSIST`.
- Reward mutations and Unique claims are written transactionally with a unique
  idempotency key. Retries return the original result and never create another
  ledger entry.
- The economy ledger is append-only; balances are derived or transactionally
  maintained from ledger changes, never trusted from client input.

**Why:** Reconnects and retries are normal mobile behavior and must not produce
duplicate rewards.

## ADR-006 — Content and public IDs

**Status:** Accepted — 2026-08-03

- Hero, item, trait, effect, and encounter IDs are stable public string IDs,
  beginning with the IDs in the Alpha plan (`H01`–`H20`, `U01`–`U06`).
- Content is data-defined, immutable once published, and loaded by explicit
  `content_version`.
- The content compiler validates IDs, references, numeric ranges, and visual
  anchors before a build is accepted.
- A new version supersedes content; it never silently changes an in-progress
  run's locked snapshot.

**Why:** Stable data contracts make replay, rollback, balance experiments, and
client asset compatibility reliable.

## ADR-007 — Deployment and secrets

**Status:** Accepted — 2026-08-03

- API and worker run as containers on Railway or an equivalent container host.
- Art assets live in Cloudflare R2 and are served through a CDN.
- Production secrets are held only in the host's secret store. No client build,
  repository file, event log, or content pack may contain a secret.
- Development, staging, and production use separate Supabase projects and
  storage buckets.

**Why:** This keeps deploys reproducible and prevents development credentials
from becoming client assets.

## Deferred decisions

- Exact Godot 4 minor version, Android minimum SDK, and CI provider will be
  selected when the client and release pipeline are created.
- PvP transport, matchmaking, ranking, payments, guilds, and marketplace are
  explicitly outside Alpha scope.

## ADR-008 — Canonical 4x6 and online sequencing

**Status:** Accepted — 2026-08-12

- New content, runs, saves, replays, and future room protocols use
  `production-4x6-0.1.0` / `alpha-0.4.0` / `asset-4x6-0.1.0`.
- Legacy 4x8 state is migrated only when every occupied cell maps to the canonical three-row player half; otherwise it is rejected without mutation.
- Online PvP work is sequenced after the offline canonical, capture, device, and Gate 2 evidence. A desktop pass cannot substitute for physical-device performance evidence.
