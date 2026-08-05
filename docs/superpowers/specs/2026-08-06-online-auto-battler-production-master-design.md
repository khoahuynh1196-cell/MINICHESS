# Online Auto-Battler Production Master Design

**Status:** Master design approved by user — 2026-08-06  
**Target branch:** `feature/auto-battler-alpha`  
**Product target:** Complete Android online auto-battler released on Google Play  
**Implementation status:** Not started from this specification

## 1. Purpose

This document replaces the current Alpha product scope as the authoritative
production design. The project keeps the existing deterministic combat core,
server-authoritative command model, content compiler, PvE run systems, twenty
heroes, traits, items, Unique transformations, replay events, tests, and Android
client foundation. It does not preserve the current presentation architecture,
conflicting board rules, placeholder-quality runtime art, local-only identity,
or PvE-only server topology.

The finished product is an original eight-player online auto-battler inspired by
the strategic structure of the genre: shared shop pools, economy management,
level progression, star upgrades, synergies, itemization, positioning, PvE and
PvP rounds, elimination, placement, ranked seasons, and match history. It must
not copy Teamfight Tactics names, characters, art, UI composition, board shape,
audio, lore, protected icons, or proprietary content.

The production goal is not merely to export an APK. A release is successful
only when a player can install the game from Google Play, authenticate, finish
the PvE onboarding, enter an eight-player online match, reconnect after a
network interruption, receive an authoritative placement and rank update, earn
achievements, review match history, and continue playing without developer-only
controls or manual server configuration.

---

## 2. Product vision

### 2.1 Core fantasy

The player leads a party of chibi animal adventurers through a competitive
magical expedition. Every match combines roster building, economy, positioning,
and a single powerful **Unique Transformation** that visibly and mechanically
changes one hero.

### 2.2 Product pillars

1. **Readable tactical combat** — the player can identify movement, attacks,
   casts, control effects, damage, healing, shields, deaths, and the reason a
   fight was won or lost.
2. **Meaningful adaptation** — shop rolls, opponents, items, traits, and Unique
   Transformations create decisions rather than automatic builds.
3. **Online integrity** — the server owns RNG, shop pools, economy, pairings,
   combat, placement, rating, and achievement progress.
4. **Mobile-first clarity** — portrait controls, large touch targets, stable
   layout, concise information hierarchy, and device-tested performance.
5. **Original identity** — animal species, cozy tactical fantasy, rectangular
   board geometry, original UI, original animation, and original content.
6. **Live-service safety** — versioned content, reversible releases, durable
   match recovery, observability, and no balance patch changing an active match.

### 2.3 Launch audience

- Players who enjoy strategy and roster-building games.
- Mobile players who want a complete match in approximately 18–25 minutes.
- Players who understand neither advanced technology nor developer tooling.
- Initial production region: Southeast Asia, with Vietnamese and English UI.

---

## 3. Locked launch scope

| Area | Launch decision |
| --- | --- |
| Platform | Android portrait-first |
| Store | Google Play, signed Android App Bundle |
| Online match | Eight-player synchronous auto-battler |
| Launch modes | Adventure PvE, Normal, Ranked |
| Ranked population | Eight human players; no rating-affecting bots |
| Normal population | Human queue, with server bots permitted after a configurable timeout |
| Roster | H01–H20 retained and fully remade |
| Species | Catfolk, Dogfolk, Rabbitfolk, Highland Cattle, Exotic Companions |
| Roles | Guardian, Fighter, Ranger, Mage, Support |
| Unique system | U01–U06 retained as one-per-team transformations |
| Board | 4 columns × 8 rows; four rows per side |
| Maximum deployed heroes | 8 |
| Shop | Five slots from a shared eight-player pool |
| Star upgrades | Three copies → 2-star; nine total copies → 3-star |
| Items | Normal items plus at most one Unique per team |
| Match target | 18–25 minutes under normal pacing |
| Account | Guest account, then Google Play Games account linking |
| Monetization | Cosmetic-only at launch; no power sales |
| Client simulation | Presentation only; no authoritative damage, RNG, shop, or placement |
| Backend | Fastify/TypeScript modular monolith plus match and combat workers |
| Durable storage | PostgreSQL |
| Queue/presence/room routing | Redis |
| Binary assets | CDN/R2-compatible object storage |

### 3.1 Explicit launch exclusions

The following are not part of launch and must not block production readiness:

- Guilds, clans, public chat, voice chat, trading, gifting, and user-generated
  content.
- iOS, desktop, console, or cross-platform matchmaking.
- Tournament brackets and public spectator lobbies.
- Battle pass, gacha, paid gameplay advantages, or paid stat boosts.
- More than twenty playable heroes in the first production ruleset.
- More than three primary launch modes.
- Real-time control of units after combat begins.

---

## 4. Current repository disposition

### 4.1 Preserve

- Deterministic fixed-point simulation.
- Seeded RNG streams and stable event ordering.
- Combat snapshot and replay event concepts.
- Server-authoritative run commands, revisions, and idempotency.
- Content compiler and immutable content versions.
- H01–H20 identities and current species/role mapping.
- Normal items and U01–U06 concepts, subject to rebalance and presentation
  remake.
- PvE Adventure round structure as a separate mode.
- Automated game-core and server test patterns.
- Godot as the production client engine.

### 4.2 Replace or migrate

- The conflicting 3×8, 4×6, and presentation-specific board assumptions are
  replaced by one shared 4×8 geometry contract.
- `battle_controller.gd` is removed from its God-object role. It may remain
  temporarily as a compatibility adapter during migration, but cannot receive
  new production feature responsibilities.
- Runtime UI is rebuilt as `.tscn` screens and reusable components rather than
  one script constructing most controls by absolute coordinates.
- Local fixed actor/tenant identity is replaced by authenticated account and
  session context.
- Per-run shared pool logic is generalized into match-room shared pool ownership
  for eight online players.
- Full-run JSON persistence remains available for Adventure compatibility, while
  online matches use normalized metadata, append-only authoritative events, and
  phase snapshots.
- Current generated cutouts, reused portraits, and multi-purpose image records
  are replaced by role-specific production assets.
- Localhost endpoint defaults are replaced by environment-aware endpoint
  resolution and an explicit boot connectivity state.

### 4.3 Source-of-truth hierarchy

Production rules use this priority:

1. `ruleset_version` defines simulation and match rules.
2. `content_version` defines heroes, traits, items, encounters, shop pool, and
   balance values.
3. `asset_bundle_version` defines compatible client visuals/audio.
4. Server match snapshot locks all three versions for the entire match.
5. Godot may render only a compatible asset bundle and may never reinterpret
   gameplay values.

Board dimensions, cell ownership, shop size, level progression, pool counts,
round schedule, and damage rules must not be duplicated as unrelated constants
across game-core, server, and Godot. They are compiled into typed shared
contracts and validated by compatibility tests.

---

## 5. Game modes

## 5.1 Adventure PvE

Adventure keeps the existing eight-round expedition concept and becomes the
primary onboarding and solo build-testing mode.

| Round | Purpose | Required teaching/result |
| --- | --- | --- |
| 1 | Basic placement | Buy, bench, deploy, start combat |
| 2 | Shop and upgrade | Refresh and first duplicate decision |
| 3 | Trait check | Explain active species/role synergy |
| 4 | Miniboss | Reveal and select a Unique Transformation |
| 5 | Enemy affix | Adapt formation or item holder |
| 6 | Build check | Reward choice with meaningful trade-off |
| 7 | Full formation | Test backline and frontline placement |
| 8 | Final boss | Victory/defeat recap and mode completion |

Adventure uses the same combat, hero, item, trait, animation, and asset systems
as online play. It may use a dedicated economy curve and fixed encounter content,
but it may not implement a second combat engine.

## 5.2 Normal

Normal is the first online mode shown after Adventure onboarding.

- Uses the standard eight-player ruleset.
- Does not change seasonal rank.
- Can fill missing seats with authoritative server bots after the configured
  queue timeout.
- Bot identity is visibly marked in the result screen.
- Match history records Normal matches separately from Ranked.
- Normal may enable experimental content through explicit mode content versions,
  never through client-only switches.

## 5.3 Ranked

Ranked uses eight human players and the production seasonal ruleset.

- No bots can affect rating.
- Match result, placement, rating transaction, and achievement events are
  committed idempotently.
- All players in one match use the same ruleset/content/asset compatibility
  version.
- Ranked queue requires valid session, supported client build, acceptable
  integrity result, and no active ranked match.
- A reconnecting player returns to the existing match; reconnect never creates
  a second seat.

## 5.4 Deferred mode framework

The room engine is designed to support Blitz, Daily Challenge, rotating events,
and custom rooms later. Those modes are configuration over common systems, not
separate forks of combat or shop code.

---

## 6. Standard online match rules

### 6.1 Match state machine

```text
CREATED
→ ACCEPTING_PLAYERS
→ INITIALIZING
→ PLANNING
→ LOCKING_SNAPSHOTS
→ SIMULATING
→ PLAYBACK
→ ROUND_RESOLUTION
→ PLANNING / ELIMINATION
→ MATCH_COMPLETE
→ RESULTS_COMMITTED
```

A match phase includes a server sequence, start timestamp, deadline, and locked
ruleset version. Clients use the server clock and phase deadline; local timers
are visual aids only.

### 6.2 Player state

- Eight seats.
- 100 starting health.
- Level 3 starting level.
- 10 starting gold.
- Eight bench slots.
- Up to eight deployed heroes at level 8 or 9.
- One active shop of five slots.
- One Unique Transformation maximum per team.
- Eliminated players may spectate until match completion or leave safely.

### 6.3 Level and deployment cap

| Level | Deployment cap |
| ---: | ---: |
| 3 | 3 |
| 4 | 4 |
| 5 | 5 |
| 6 | 6 |
| 7 | 7 |
| 8 | 8 |
| 9 | 8, with improved shop odds |

XP cost and thresholds are versioned content. The launch default is four gold
per XP purchase, with level thresholds selected to keep the full match inside
the target duration.

### 6.4 Economy

- Base round income: 5 gold.
- Interest: +1 gold per 10 saved gold, capped at +5.
- Win and loss streak income use versioned thresholds and cap at +3.
- Shop refresh: 2 gold, unless a reward grants a free refresh.
- Buying XP: 4 gold per purchase.
- Selling returns a versioned value derived from cost and star level.
- Economy mutations are append-only ledger entries linked to match, player,
  command ID, reason, and authoritative revision.
- Currency may not become negative and may not be awarded twice after retry.

### 6.5 Shared hero pool

The pool belongs to the match room, not an individual player.

- Each hero rarity has a configured number of copies.
- Shop rolls exclude unavailable copies and Unique-only content.
- Buying removes the exact shop-reserved copy from the pool.
- Refreshing releases unpurchased reservations and reserves a new five-slot
  shop atomically.
- Selling, elimination cleanup, or match-end cleanup returns legal copies.
- Star upgrades consume owned instances without silently changing pool counts.
- Every pool mutation is processed by the room single writer.
- Property tests prove pool conservation across buy, refresh, sell, merge,
  disconnect, elimination, and recovery.

### 6.6 Star upgrades

- Three matching 1-star instances merge into one 2-star instance.
- Three matching 2-star instances merge into one 3-star instance.
- Bench and board copies both count.
- Merge order is deterministic by acquisition sequence and instance ID.
- Equipped normal items are returned to inventory before an automatic merge,
  then may be re-equipped by the player.
- The Unique holder cannot be consumed ambiguously; a merge involving its hero
  transfers the Unique to the merged survivor using deterministic rules and
  emits a presentation event.

---

## 7. Board, positioning, targeting, and pairing

### 7.1 Board geometry

- Rectangular board: 4 columns × 8 rows.
- Enemy territory: rows 0–3.
- Player territory: rows 4–7.
- Grid index: `row * 4 + column`.
- One combat unit per cell.
- Default movement is four-directional.
- Manhattan range and deterministic path tie-breaking remain valid.
- Summons use legal empty cells and respect side summon limits.

Prepare UI presents only the local player deployment half as interactive.
Combat UI shows the full board.

### 7.2 Pairing

- Pairings are server-generated at each PvP round.
- The scheduler minimizes immediate rematches and balances encounter history.
- When an odd number of active players remains, one player fights a ghost
  snapshot from an eligible opponent.
- Ghost combat cannot mutate the ghost owner’s shop, economy, health, or roster.
- Pairing is revealed only after snapshots are locked.
- Pairing randomness uses a dedicated deterministic stream.

### 7.3 Player damage

The launch default damage is calculated from stage base damage plus surviving
enemy unit contribution, capped by content rules. The exact table is versioned,
but all calculations remain integer-only and server-authoritative. Draws at the
combat timeout use deterministic health scoring; no client animation result can
change the resolved winner.

### 7.4 Round schedule

The standard launch schedule is content-driven and follows this structure:

- Stage 1: three onboarding PvE rounds followed by two PvP rounds.
- Stage 2: three PvP rounds, one Transformation selection round, one PvP round.
- Stage 3: four PvP rounds and one supply/elite round.
- Stage 4: four PvP rounds and one boss reward round.
- Stage 5 onward: four PvP rounds and one supply or elite round until one player
  remains.

Planning duration defaults to 30 seconds in early stages and 25 seconds in late
stages. Combat simulation caps at 35 seconds. Playback may end earlier when all
required events have been presented.

---

## 8. Heroes, traits, items, and Unique Transformations

### 8.1 Roster mapping

| Hero IDs | Species | Role coverage |
| --- | --- | --- |
| H01–H05 | Catfolk | Guardian, Fighter, Ranger, Mage, Support |
| H06–H10 | Dogfolk | Guardian, Fighter, Ranger, Mage, Support |
| H11–H14 | Rabbitfolk | Fighter, Ranger, Mage, Support |
| H15–H17 | Highland Cattle | Guardian, Fighter, Support |
| H18–H20 | Exotic Companions | Ranger, Mage, Guardian |

All twenty are launch-playable. No additional hero may be added before the
entire roster passes gameplay, readability, animation, asset, balance, and
mobile performance gates.

### 8.2 Trait philosophy

Species traits alter behavior, positioning incentives, or interaction patterns.
Role traits strengthen combat function. Traits must not be merely invisible
stat bundles when a readable behavioral expression is possible.

- Catfolk: rewards isolation, target selection, or evasive positioning.
- Dogfolk: rewards adjacency, protection, and pack coordination.
- Rabbitfolk: rewards tempo, movement, early casting, or repositioning.
- Highland Cattle: rewards anchoring, frontline control, and displacement
  resistance.
- Exotic Companions: provides flexible or cross-trait interactions without
  becoming universal best-in-slot units.
- Guardian: mitigation and shielding.
- Fighter: sustained melee pressure.
- Ranger: range, precision, and target priority.
- Mage: mana and area spell impact.
- Support: healing, shielding, cleansing, and team buffs.

Every trait breakpoint, effect, visual cue, tooltip, and icon is content-defined
and validated. Bench heroes and summons do not count toward active traits.

### 8.3 Items

- Normal items are divided into offensive, defensive, and utility categories.
- Each item has one concise primary purpose and one readable trigger maximum at
  launch.
- A hero holds at most two items.
- At most one of those items may be the team’s Unique Transformation.
- Item effects are composed from approved primitives rather than hero-ID code.
- Equip, unequip, merge return, elimination cleanup, and reconnect are
  authoritative and idempotent.

### 8.4 Unique Transformation identity

The six retained transformations are the signature mechanic:

| ID | Identity | Required tactical effect |
| --- | --- | --- |
| U01 | Lion Crown | Leadership, takedown tempo, team rally |
| U02 | White Wolf Claw | Backline hunting, dash, target reset |
| U03 | Turtle Shell | Anchor tanking, damage absorption, shared shield |
| U04 | Unicorn Horn | Spell amplification and multi-target casting |
| U05 | Fox Mask | Decoy, deception, or controlled repositioning |
| U06 | Phoenix Feather | One revival and a clearly telegraphed rebirth impact |

A player receives a one-of-three choice during the Transformation round. The
choice is generated by the server, cannot be rerolled, and is persisted before
presentation. The selected Unique visibly changes the holder through overlay,
rig attachment, aura, skill treatment, icon, and tooltip. There is exactly one
Unique per team.

---

## 9. Deterministic combat and presentation contract

### 9.1 Simulation ownership

- `game-core` owns movement, targeting, attacks, casts, effects, damage, healing,
  shields, statuses, summons, death, timeout, winner, and result hash.
- Match workers create locked snapshots and combat seeds.
- Combat workers execute deterministic simulation without database or network
  dependencies.
- Godot renders authoritative events and never calculates an outcome.

### 9.2 Event schema

Every presentation-relevant action contains enough timing data to animate
correctly:

```text
tick
sequence
type
action_id
source_unit_id
target_unit_id
source_cell
target_cell
animation_key
cast_start_tick
release_tick
impact_tick
projectile_key
vfx_key
sfx_key
payload
```

Events with no applicable field omit it. Event order is stable by tick and
sequence. Unknown event types are logged and visibly fail development tests;
production may use a safe generic fallback without changing state.

### 9.3 Animation timeline

Example basic attack:

```text
ATTACK_STARTED at tick 100
PROJECTILE_RELEASED at tick 103
DAMAGE_APPLIED at tick 108
HIT_REACTION at tick 108
UNIT_DIED at tick 109 when applicable
```

The client starts the attack at tick 100, releases the projectile at tick 103,
shows impact and changes the displayed HP at tick 108, and does not play death
before the authoritative death event.

### 9.4 Unit animation state priority

```text
Death
> Hard control
> Hit reaction
> Cast
> Attack
> Move
> Idle
```

A lower-priority state cannot overwrite a higher-priority state without an
explicit transition. Reduced Motion shortens or replaces animation clips but
preserves event timing and impact ordering.

### 9.5 Playback synchronization

For each pairing, the server sends:

- `combat_id`
- `playback_start_at`
- `tick_rate`
- initial snapshot hash
- event chunks with sequence ranges
- final result hash

Clients synchronize against server time. If events arrive late, the presenter
may accelerate non-critical interpolation or skip decorative anticipation, but
may not reorder authoritative impacts. Reconnect resumes from the last confirmed
event sequence.

---

## 10. Online architecture

### 10.1 Deployment shape

The initial production backend is a modular monolith with independently scalable
workers, not a large microservice fleet.

```text
Godot Client
  ├─ HTTPS → API Gateway modules
  └─ WebSocket → Realtime Gateway
                   │
              Matchmaker
                   │
             Match Room Worker
                   │
             Combat Worker Pool
                   │
        PostgreSQL / Redis / Object Storage
```

### 10.2 Server modules

| Module | Responsibility |
| --- | --- |
| Identity | Guest creation, Google account linking, sessions, token rotation |
| Profile | Display name, avatar, settings, cosmetics, progression |
| Content | Active ruleset/content/asset versions and compatibility |
| Matchmaking | Queue tickets, region, mode, MMR window, cancellation |
| Match Room | Single-writer phase state, shops, pool, economy, pairing, elimination |
| Combat | Snapshot validation, deterministic simulation, event/result hash |
| Ranking | MMR, LP, tier, season reset, idempotent rating transaction |
| Achievement | Authoritative progress and unlock evaluation |
| History | Placement, composition, damage, items, traits, replay metadata |
| Admin | Content activation, emergency disable, match inspection, player support |
| Telemetry | Metrics, traces, logs, crash correlation, audit events |

### 10.3 Match room single-writer model

Each match has one active owner identified by a room lease and fencing token.
Only that owner may accept mutations.

The room worker:

1. Receives validated player commands.
2. Assigns server sequence numbers.
3. Checks seat, phase, expected revision, command ID, and game invariants.
4. Mutates player state and the shared pool atomically.
5. Appends an authoritative match event.
6. Broadcasts ACK/rejection and state patches.
7. Locks snapshots at the phase deadline.
8. Dispatches pair combats to workers.
9. Applies results, damage, rewards, eliminations, and next phase.
10. Persists a phase checkpoint and resumes safely after process failure.

### 10.4 Persistence strategy

PostgreSQL is authoritative for durable identity, match, rating, and progress.
Redis is ephemeral coordination infrastructure.

- Accepted match commands are recorded as append-only authoritative events.
- A compact match snapshot is written at every phase boundary and after critical
  result application.
- Room recovery loads the latest snapshot, replays later events, acquires a new
  fencing token, and resumes the same match ID.
- Rating, achievement, and match-history updates are emitted through a durable
  outbox and consumed idempotently.
- Redis loss may delay queueing or routing but may not erase completed match
  results or player inventory.

### 10.5 Core durable entities

```text
accounts
account_identities
sessions
profiles
player_settings
cosmetic_inventory
seasons
rank_states
matchmaking_tickets
matches
match_players
match_events
match_snapshots
combat_records
rating_transactions
achievement_definitions
player_achievements
match_history
content_releases
asset_bundles
outbox_events
audit_logs
```

Every player-owned table includes `player_id`; every seasonal record includes
`season_id`; every mutation record includes correlation and idempotency keys.

---

## 11. Authentication, profile, and session

### 11.1 Account flow

1. First launch creates a guest account through the server.
2. The client receives a short-lived access token and rotating refresh token.
3. Google Play Games sign-in can link the guest account without losing history.
4. One Google identity cannot silently create multiple production accounts.
5. Account deletion is available in-app and through a documented web route.

### 11.2 Session security

- Access tokens are short-lived.
- Refresh token rotation invalidates the replaced token.
- Session revocation is supported.
- Ranked queue requires an unexpired authenticated session.
- Raw tenant/player identifiers from the client are ignored; identity is derived
  from the verified session.
- Sensitive secrets never ship in the Godot bundle.

### 11.3 Profile

The launch profile contains:

- Display name and server-generated immutable player ID.
- Avatar and cosmetic frame.
- Adventure completion state.
- Current rank, peak seasonal rank, and placement calibration status.
- Match history summary.
- Achievement showcase.
- Language, accessibility, audio, and vibration settings.

---

## 12. Realtime protocol and reconnect

### 12.1 Message families

```text
CLIENT_HELLO
AUTHENTICATED
QUEUE_JOIN
QUEUE_STATUS
QUEUE_CANCEL
MATCH_FOUND
ROOM_SNAPSHOT
PLAYER_COMMAND
COMMAND_ACK
COMMAND_REJECTED
PHASE_CHANGED
SHOP_UPDATED
PLAYER_STATE_UPDATED
PAIRING_REVEALED
COMBAT_READY
COMBAT_EVENTS
COMBAT_FINISHED
PLAYER_ELIMINATED
MATCH_ENDED
ERROR
PING
PONG
```

Every message contains protocol version, server sequence or request correlation,
and match ID when applicable.

### 12.2 Player command envelope

```json
{
  "protocol_version": 1,
  "command_id": "uuid",
  "match_id": "match-id",
  "expected_revision": 42,
  "type": "BUY_SHOP_HERO",
  "payload": {}
}
```

The server derives player identity from the socket session. A client-supplied
player ID is not authoritative.

### 12.3 Reconnect behavior

- The server match continues while the player is disconnected.
- Existing roster, formation, shop, and economy remain unchanged unless a
  previously accepted command resolves.
- The player may reconnect before or after elimination.
- Reconnect loads the latest room snapshot, missing authoritative patches,
  current phase deadline, server clock offset, and missing combat events.
- No duplicate seat, reward, pool mutation, or rating transaction is created.
- A disconnected player receives no hidden automatic purchases. Planning simply
  expires with the last valid state.

---

## 13. Ranked, seasons, and leaderboard

### 13.1 Hidden MMR

Hidden MMR uses placement and lobby strength. Each placement creates pairwise
outcomes against the other seven players. Provisional accounts use a larger
rating factor; established accounts use a smaller factor.

### 13.2 Visible rank

```text
Bronze
Silver
Gold
Platinum
Diamond
Master
Grandmaster
Legend
```

Bronze through Diamond use divisions and LP. Master and above use seasonal
points and leaderboard position.

Launch base placement LP before lobby-strength adjustment:

| Placement | Base LP |
| ---: | ---: |
| 1 | +45 |
| 2 | +30 |
| 3 | +15 |
| 4 | +5 |
| 5 | -5 |
| 6 | -15 |
| 7 | -30 |
| 8 | -45 |

Calibration, rank protection, tier promotion, and Master thresholds are
server-configured seasonal rules. The server commits one rating transaction per
player per match result. Retrying the result processor returns the existing
transaction.

### 13.3 Seasons

- Each season locks an active ruleset/content version set.
- New matches use the latest active compatible release.
- Active matches retain their locked versions until completion.
- Season start applies a soft MMR and visible-rank reset.
- Rank rewards are cosmetic.
- Region leaderboards are server-authoritative.
- Google Play leaderboard integration mirrors approved seasonal scores but does
  not replace backend rank truth.

---

## 14. Achievements and match history

### 14.1 Achievement categories

- Adventure onboarding and boss completion.
- Playing or winning with each of H01–H20.
- Reaching trait breakpoints.
- Completing each U01–U06 transformation path.
- Economy milestones.
- Comeback from low health.
- High damage, healing, shielding, or control contribution.
- Ranked tier milestones.
- Seasonal challenges.

Achievements are standard or incremental, visible or hidden, and evaluated from
authoritative match/adventure summaries. Unlock and reward grant are idempotent.
Google Play achievement IDs are mappings to server definitions, not the primary
source of progress.

### 14.2 Match history

Every completed online match records:

- Mode, season, region, start/end time.
- Placement and rating delta.
- Final health and elimination round.
- Final board, bench summary, hero stars, items, traits, and Unique holder.
- Damage, healing, shielding, kills, and MVP statistics.
- Opponent placements.
- Ruleset/content versions and result hash.
- Replay metadata or retention-expiry state.

---

## 15. Godot client architecture

### 15.1 Screen graph

```text
Boot
→ Authentication
→ Home
  ├─ Mode Select
  ├─ Queue
  ├─ Profile
  ├─ Rank
  ├─ Achievements
  ├─ Collection
  └─ Settings

Match
  ├─ Prepare
  ├─ Combat
  ├─ Reward
  ├─ Elimination/Spectate
  └─ Results
```

### 15.2 Scene/component structure

```text
client-godot/
  scenes/
    app/
    screens/
    match/
    components/
  scripts/
    app/
    network/
    presenters/
    animation/
    audio/
    assets/
```

Primary screens are `.tscn` resources using containers, anchors, size flags,
safe-area margins, and semantic theme resources. Runtime scripts bind state and
emit intents; they do not recreate the entire visual tree on every state update.

### 15.3 Controllers

| Controller | Responsibility |
| --- | --- |
| AppController | Application state and navigation |
| SessionController | Guest/link login, token lifecycle |
| EndpointResolver | Dev, emulator, staging, production endpoint selection |
| RealtimeClient | WebSocket, sequencing, reconnect, server clock |
| MatchPresenter | Room snapshot and phase presentation |
| PreparePresenter | Board, bench, shop, item, trait interactions |
| CombatPresenter | Event timeline and actor animation |
| AudioDirector | Music, SFX, ducking, accessibility |
| AssetResolver | Content keys to compatible runtime assets |

`battle_controller.gd` must be decomposed and removed as the main runtime
controller after compatibility tests prove equivalent Adventure and replay
behavior.

### 15.4 Prepare UX

- Board remains visible and is the primary focal area.
- Bench remains visible.
- Shop, items, and traits use a controlled bottom sheet or tabs.
- Start/Ready action remains reachable without scrolling.
- Formation supports drag-and-drop and tap-select fallback.
- Opponent preview, timer, gold, level, health, and active trait summary are
  readable without opening debug panels.
- Every disabled action explains its reason.

### 15.5 Combat UX

- Full board uses most of the viewport.
- Only player-facing controls are pause where permitted, 1×/2× playback,
  inspect, and spectate navigation.
- No text such as “server resolved” or “authoritative event stream” appears in
  production UI.
- HP/mana, status, targeting, casts, and deaths remain readable at normal mobile
  size.
- Damage numbers are pooled and limited to prevent visual noise.
- Basic attacks never visually overpower signature skills.

---

## 16. Art, animation, VFX, and audio remake

### 16.1 Art direction

**Cozy tactical fantasy** with original 2D chibi animal heroes:

- Broad head, compact body, readable species anatomy.
- Warm dark-brown outline.
- Controlled cel shading.
- Clear role silhouette before color.
- Limited texture noise.
- Board and units separated by value and saturation.
- Navy, stone, parchment, and gold UI accents without casino-like excess.
- VFX built from shapes and readable impact rather than uncontrolled bloom.

### 16.2 Hero production set

Each H01–H20 receives distinct assets for:

- Runtime rig parts or animation-ready sprite layers.
- Shop portrait.
- Collection/profile portrait.
- Ability icon.
- Species and role icons.
- Basic attack treatment.
- Cast treatment.
- Hit and death treatment.
- Unique Transformation overlays/attachments where compatible.

A single generated PNG may not simultaneously serve as board sprite, portrait,
and ability icon.

### 16.3 Animation system

Use Godot-native `Skeleton2D`, `Bone2D`, `AnimationPlayer`, `AnimationTree`, and
pooled VFX scenes.

Reusable foundations:

- Five species base rigs.
- Five role timing profiles.
- Per-hero body, costume, weapon, and skill overrides.
- Explicit animation markers for anticipation, release, impact, recovery, and
  death completion.

Every hero must support Idle, Move, Attack, Cast, Hit, Hard Control, Death, and
Victory. Animation clips must match authoritative event timing.

### 16.4 Monster and biome set

Four launch biomes:

- Meadow.
- Ruins.
- Frost Keep.
- Ember Citadel.

Each biome has at least a normal melee unit, ranged/caster unit, elite, and boss.
Board art, props, ambient particles, monsters, UI, and VFX remain separate
layers.

### 16.5 Audio

- UI confirm, cancel, buy, refresh, lock, merge, reward, rank change.
- Attack families by role/weapon.
- Spell families and status cues.
- Round start/end, elimination, victory, defeat.
- Biome music and home/ranked themes.
- Audio buses support master, music, SFX, and accessibility reduction.

---

## 17. Security and anti-cheat

- Client cannot submit RNG, shop results, damage, reward, opponent pairing,
  placement, rating, or achievement completion.
- All commands require valid phase, expected revision, and command ID.
- Rate limits apply per session, player, route, and match.
- Ranked queue checks supported client build and integrity policy.
- Play Integrity is one signal, not the sole ban mechanism.
- Content and asset hashes are verified at session/match entry.
- Result hashes and authoritative logs support investigation.
- Suspicious command frequency, impossible sequence, repeated integrity failure,
  and abnormal reconnect patterns are logged.
- Admin tools may void rewards or rating for a corrupt match with an audit trail;
  automated permanent bans require a separate reviewed policy.

---

## 18. Failure handling and recovery

### 18.1 Client failures

- Boot has explicit connectivity, maintenance, update-required, auth-failed, and
  retry states.
- Network loss during a match enters reconnect UI without abandoning the seat.
- A stale command is rejected with authoritative revision and safe refresh.
- Missing non-critical art uses a visible safe fallback and logs telemetry.
- Missing ruleset/content compatibility blocks match entry rather than guessing.

### 18.2 Server failures

- Room lease prevents two workers from writing the same match.
- Fencing tokens reject writes from an expired owner.
- Match recovery uses snapshot plus append-only events.
- Combat jobs are idempotent by combat ID and snapshot hash.
- Rating and achievement consumers are idempotent by match/player/result key.
- Deployments drain room workers instead of killing active matches.
- Redis failure pauses new queue operations while durable active matches remain
  recoverable from PostgreSQL.

---

## 19. Content, balance, and live operations

- Heroes, traits, items, pool counts, odds, economy, round schedule, opponents,
  and rewards are versioned content.
- Simulation primitives and formulas are versioned rulesets.
- Asset bundles declare compatible content IDs.
- Content passes schema, reference, invariant, localization, asset, and golden
  hash validation before activation.
- Admin can disable a queue mode or prevent new matches from using a broken
  content release.
- Active matches retain locked versions.
- Balance telemetry includes pick rate, top-four rate, first-place rate, average
  placement, item usage, trait breakpoint rate, hero damage/heal/shield, and
  Unique performance.
- No balance conclusion is accepted without sample-size and rank-segment context.

---

## 20. Analytics and observability

### 20.1 Product funnel

- Install → boot success.
- Guest account creation.
- Adventure start/completion.
- First Normal queue/match completion.
- First Ranked queue/match completion.
- Day-1 and Day-7 retention.
- Match abandonment and reconnect rate.
- Store/profile/achievement engagement.

### 20.2 Technical metrics

- API and WebSocket latency percentiles.
- Command ACK/reject rate by code.
- Queue time by region/mode/MMR.
- Room recovery count and duration.
- Combat simulation duration.
- Result hash mismatch count, target zero.
- Client crash-free session and ANR rate.
- FPS, frame-time spikes, memory, texture memory, load time.
- Asset/content compatibility failures.

Logs include correlation IDs across client session, queue ticket, match, combat,
outbox, and rating transaction.

---

## 21. Testing strategy

### 21.1 Game-core

- Unit tests for all formulas and effect primitives.
- Property tests for determinism, pool conservation, board legality, target
  stability, star merges, item limits, and timeout resolution.
- Golden replay tests by ruleset/content version.
- Fuzz tests for legal content-generated snapshots.

### 21.2 Server

- Command use-case tests with in-memory ports.
- PostgreSQL transaction and concurrency tests.
- Redis queue/lease/routing integration tests.
- Eight-player room simulation tests.
- Disconnect/reconnect/recovery tests.
- Duplicate command, duplicate combat job, duplicate result consumer tests.
- Ranking and achievement idempotency tests.
- Security tests for cross-account and stale-session access.

### 21.3 Godot

- Scene smoke tests for all screens and states.
- Layout tests at supported aspect ratios and text scales.
- Touch interaction tests for board, bench, shop, item, ready, queue, and retry.
- Replay timing tests against authoritative event fixtures.
- Asset manifest and animation marker tests.
- Reduced Motion and localization tests.
- Screenshot regression for critical screens.

### 21.4 End-to-end

- Fresh install → guest login → Adventure completion.
- Eight clients/bots → full Normal match.
- Eight authenticated clients → full Ranked match.
- Disconnect and reconnect during planning and playback.
- Room worker termination and recovery.
- Match completion → rating, achievement, history exactly once.
- Android emulator connects to dev server using emulator endpoint resolution.
- Physical-device run validates install, input, network, frame time, memory, and
  full match flow.

---

## 22. Performance and reliability targets

| Metric | Launch target |
| --- | --- |
| Reference-device frame rate | 60 FPS target |
| Low-device frame floor | 30 FPS without gameplay divergence |
| Command ACK p95 in launch region | Under 250 ms |
| Reconnect under stable network | Under 5 seconds |
| Combat simulation | Faster than playback duration with safe worker headroom |
| Crash-free sessions | At least 99.5% |
| Result hash mismatch | 0 accepted mismatches |
| Room recovery | No duplicated mutation or lost placement |
| Load gate | At least 1,000 CCU equivalent before initial release |
| Concurrent room reference | 125 simultaneous eight-player rooms |

VFX pooling, texture atlases, lazy loading, and animation resource reuse are
mandatory. Performance is measured on device; desktop editor behavior is not a
release claim.

---

## 23. Google Play production requirements

- Production release uses a signed `.aab`, not only a debug APK.
- Play App Signing enabled.
- ARM64 supported.
- Production target API selected to satisfy the Google Play requirement at
  release time; the planned production branch targets API 36.
- Separate internal, closed, open, and production tracks.
- Version code/name and rollback policy.
- Store icon, feature graphic, screenshots, trailer, short/long description.
- Content rating, privacy policy, Data Safety declaration, and account deletion.
- Crash and ANR monitoring.
- Play Games Services mapping for sign-in, approved achievements, and mirrored
  leaderboard data.
- Closed testing requirements are scheduled before the intended production
  application.
- Staged rollout with server compatibility retained for the previous supported
  client build.

---

## 24. Production milestone gates

### Gate 0 — Canonical rules and migration foundation

- Preserve a tagged Alpha snapshot.
- Introduce one 4×8 shared board contract.
- Align shop, level, economy, pool, trait, item, and Unique rules.
- Add compatibility tests across game-core, server, and Godot.
- No new presentation feature proceeds while rule contracts conflict.

### Gate 1 — Complete Adventure with retained scope

- All H01–H20, items, traits, U01–U06, shop, level, XP, merge, formation, reward,
  eight rounds, boss, recap, save/resume.
- Godot scene architecture replaces debug UX.
- Fresh Android install completes or loses Adventure without developer input.

### Gate 2 — Combat presentation and full asset remake

- Event timing schema implemented.
- Production rig and animation system implemented.
- Twenty heroes, sixteen monster roles, four biomes, UI kit, VFX, and audio
  integrated.
- Mobile test users can explain key combat events and loss reasons.

### Gate 3 — Identity and realtime foundation

- Guest and Google linking.
- Access/refresh session lifecycle.
- WebSocket protocol, sequencing, server clock, reconnect.
- Profile, settings, and endpoint environments.

### Gate 4 — Eight-player Normal match

- Matchmaking, room actor, shared pool, phase timer, pairing, PvP snapshots,
  ghost, elimination, spectate, result.
- Eight automated clients complete repeated matches without divergence.

### Gate 5 — Ranked, seasons, achievements, and history

- MMR, LP, tiers, seasons, leaderboard, rating outbox.
- Achievement and match-history pipelines.
- Idempotent results under retry and recovery.

### Gate 6 — Production hardening

- Load, soak, recovery, security, integrity, observability, admin, privacy,
  account deletion, and release automation.
- Physical-device performance and full-flow evidence.

### Gate 7 — Google Play release

- Internal and closed test completed.
- Store and compliance assets approved.
- Staged production rollout.
- Crash/ANR, queue, room, and balance dashboards monitored.
- Rollback and emergency content-disable procedures verified.

---

## 25. Final definition of done

The game is complete only when a new player can:

1. Install the production build from Google Play.
2. Create a guest account and optionally link Google Play Games.
3. Complete the eight-round Adventure onboarding.
4. Queue for Normal and Ranked from a production region.
5. Join an eight-player match using the shared shop pool.
6. Buy, refresh, level, merge, equip, select a Unique, position, and ready.
7. Watch animations synchronized with the authoritative combat event log.
8. Disconnect and reconnect without duplicating or losing state.
9. Finish with an accurate placement and match history.
10. Receive one correct rank update and achievement progress.
11. Continue into another match without debug controls or manual server setup.

The service must simultaneously meet the security, deterministic replay,
recovery, device performance, load, privacy, and Google Play release gates in
this document.

---

## 26. Locked master decisions

- Keep all twenty launch heroes.
- Keep and fully realize all six Unique Transformations.
- Use a 4×8 rectangular board.
- Build an eight-player synchronous online core.
- Launch with Adventure, Normal, and Ranked.
- Keep deterministic TypeScript combat as the source of truth.
- Use Godot as a presentation-only production client.
- Rebuild the Godot scene/controller architecture.
- Remake runtime hero, monster, UI, VFX, animation, and audio assets.
- Use a modular monolith plus room and combat workers, PostgreSQL, Redis, and
  object storage/CDN.
- Use backend rank truth; Google Play Games mirrors identity, approved
  achievements, and selected leaderboard values.
- Monetize cosmetics only at launch.
- Release through a signed Google Play Android App Bundle after device, load,
  security, and closed-test gates pass.
