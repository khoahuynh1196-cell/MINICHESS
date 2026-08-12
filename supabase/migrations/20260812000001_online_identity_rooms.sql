-- Online PvP foundation tables. Tokens stay hashed/opaque; room state is
-- versioned and server-owned. No client may write these tables directly.
create table if not exists public.online_identities (
  player_id uuid primary key default gen_random_uuid(),
  provider text not null default 'guest' check (provider in ('guest', 'linked')),
  device_hash text not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.online_refresh_sessions (
  refresh_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.online_identities(player_id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  rotated_from uuid references public.online_refresh_sessions(refresh_id),
  created_at timestamptz not null default now()
);

create table if not exists public.online_match_tickets (
  ticket_id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.online_identities(player_id) on delete cascade,
  region text not null,
  mode text not null,
  status text not null default 'QUEUED' check (status in ('QUEUED', 'MATCHED', 'CANCELLED', 'EXPIRED')),
  room_id uuid,
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);

create unique index if not exists online_match_tickets_one_queued_player_idx
  on public.online_match_tickets(player_id) where status = 'QUEUED';
create index if not exists online_match_tickets_queue_idx
  on public.online_match_tickets(region, mode, status, created_at);

create table if not exists public.online_rooms (
  room_id uuid primary key default gen_random_uuid(),
  region text not null,
  mode text not null,
  phase text not null default 'PREPARE',
  fencing_token bigint not null default 1,
  ruleset_version text not null default 'production-4x6-0.1.0',
  content_version text not null default 'alpha-0.4.0',
  asset_manifest_version text not null default 'asset-4x6-0.1.0',
  state jsonb not null default '{}'::jsonb,
  lease_expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ruleset_version = 'production-4x6-0.1.0'),
  check (content_version = 'alpha-0.4.0'),
  check (asset_manifest_version = 'asset-4x6-0.1.0')
);

create table if not exists public.online_room_seats (
  room_id uuid not null references public.online_rooms(room_id) on delete cascade,
  seat_index smallint not null check (seat_index between 0 and 7),
  player_id uuid not null references public.online_identities(player_id) on delete restrict,
  joined_at timestamptz not null default now(),
  primary key (room_id, seat_index),
  unique (room_id, player_id)
);

create table if not exists public.online_room_commands (
  room_id uuid not null references public.online_rooms(room_id) on delete cascade,
  command_id text not null,
  player_id uuid not null references public.online_identities(player_id) on delete restrict,
  fencing_token bigint not null,
  sequence bigint not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, command_id)
);

create table if not exists public.online_combat_results (
  room_id uuid not null references public.online_rooms(room_id) on delete cascade,
  combat_id text not null,
  result_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (room_id, combat_id)
);

alter table public.online_identities enable row level security;
alter table public.online_refresh_sessions enable row level security;
alter table public.online_match_tickets enable row level security;
alter table public.online_rooms enable row level security;
alter table public.online_room_seats enable row level security;
alter table public.online_room_commands enable row level security;
alter table public.online_combat_results enable row level security;

comment on table public.online_rooms is 'Server-authoritative eight-seat rooms; every room is canonical 4x6.';
