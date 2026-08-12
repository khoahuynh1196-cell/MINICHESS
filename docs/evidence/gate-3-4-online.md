# Gate 3–4 online PvP foundation evidence — 2026-08-12

## Scope completed

- Guest identity service with signed short-lived access tokens, rotating refresh
  tokens, revocation, and no plaintext token persistence.
- Ordered realtime session with server-clock offset, ping/pong, sequence
  rejection, duplicate-command suppression, and reconnect-safe snapshots.
- Region/mode matchmaking queue with cancellation and deterministic eight-seat
  fill.
- Server-authoritative room registry with canonical 4×6/rules/content/assets,
  fencing tokens, membership isolation, recovery lease rotation, and idempotent
  combat-result IDs.
- HTTP boundary for auth, matchmaking, room membership, room commands, room
  recovery, and realtime envelopes.
- Supabase migration for identity, refresh sessions, tickets, rooms, seats,
  commands, and combat results with RLS enabled and canonical version checks.
- Public `guest_*` player IDs are separated from durable UUID foreign keys by
  migration `20260812000002_online_identity_public_ids.sql`.
- Postgres online persistence adapter with transactional refresh rotation,
  `FOR UPDATE SKIP LOCKED` eight-seat claims, room seat writes, command
  idempotency, public-ID-to-UUID resolution, membership checks,
  fencing-token recovery, and server-only request rate limiting.
- Redis-compatible coordinator contract for atomic room lease acquire/renew/
  release with fencing tokens and bounded player-presence heartbeats; it is
  tested against an injected client but is not wired into the runtime yet.

## Verification

- RED confirmed before implementation: online contract modules and HTTP routes
  were absent.
- GREEN: online contract, HTTP, hardening, rate-limit, Postgres persistence,
  and Redis-coordinator tests; the server suite is 17 files / 183 tests
  passing, including
  malformed-token, ticket-polling, multi-client isolation, lease chaos,
  reconnect-snapshot, duplicate-result, and 429 boundary coverage.
- Client API/session/UI contracts: `online_api_client_test.gd`,
  `online_session_test.gd`, `lobby_screen_test.gd`, and `screen_router_test.gd`
  pass. The Godot suite now contains 40 scripts.

## Still open before online beta

- Wire identity creation/session rotation, the transactional Postgres adapter,
  and the Redis presence/lease coordinator into an async production runtime;
  the current runtime remains an explicit in-memory integration mode.
- Add multi-process/bot soak, reconnect chaos, phase-deadline, rate-limit,
  abuse, and security-boundary tests.
- Initial Godot online screen now includes queue polling, match result, ready,
  reconnect, and server-error feedback; production retry/backoff and match
  result presentation still need soak validation.
- Do not call online PvP release-ready until physical Android QA and these
  multi-client gates pass.

## Identity migration gate

The HTTP/Godot contract keeps the server-generated `guest_*` player ID public. Supabase durable foreign keys remain UUIDs; migration `20260812000002_online_identity_public_ids.sql` adds and backfills `online_identities.public_id`. Production wiring must resolve this public ID to UUID inside each transaction and reject unresolved mappings. Redis presence/lease coordination, multi-process soak, and physical Android QA remain open release gates.
