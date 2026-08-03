-- Initial authoritative, tenant-scoped Alpha schema.
-- Applied by Supabase migration tooling; never run manually against production.

create extension if not exists pgcrypto;

create table public.tenants (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('personal', 'shared')),
  display_name text not null check (length(display_name) between 1 and 120),
  created_at timestamptz not null default now()
);

create table public.tenant_memberships (
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner', 'member')),
  created_at timestamptz not null default now(),
  primary key (tenant_id, user_id)
);

create index tenant_memberships_user_tenant_idx
  on public.tenant_memberships (user_id, tenant_id);

create or replace function public.is_tenant_member(target_tenant_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.tenant_memberships membership
    where membership.tenant_id = target_tenant_id
      and membership.user_id = auth.uid()
  );
$$;

revoke all on function public.is_tenant_member(uuid) from public;
grant execute on function public.is_tenant_member(uuid) to authenticated;

create table public.runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  owner_user_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('prepare', 'combat', 'reward', 'completed', 'abandoned')),
  current_round integer not null default 1 check (current_round between 1 and 8),
  revision bigint not null default 0 check (revision >= 0),
  player_hp bigint not null default 30000 check (player_hp between 0 and 30000),
  gold bigint not null default 8000 check (gold >= 0),
  content_version text not null,
  ruleset_version text not null,
  run_seed_ciphertext bytea not null,
  preselected_unique_id text not null,
  unique_revealed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (id, tenant_id)
);

-- The active-run rule is enforced by the following partial index; completed and
-- abandoned runs remain available for replay/history.
drop index if exists public.runs_one_active_per_owner_idx;
create unique index runs_one_active_per_owner_idx
  on public.runs (tenant_id, owner_user_id)
  where status in ('prepare', 'combat', 'reward');

create index runs_tenant_updated_idx
  on public.runs (tenant_id, updated_at desc);

create table public.run_heroes (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null,
  hero_definition_id text not null,
  star_level integer not null default 1 check (star_level between 1 and 3),
  location_kind text not null check (location_kind in ('board', 'bench')),
  location_index integer not null,
  created_at timestamptz not null default now(),
  check (
    (location_kind = 'board' and location_index between 0 and 11)
    or (location_kind = 'bench' and location_index between 0 and 7)
  ),
  unique (id, run_id, tenant_id),
  unique (run_id, location_kind, location_index),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete cascade
);

create index run_heroes_tenant_run_idx on public.run_heroes (tenant_id, run_id);

create table public.run_items (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null,
  item_definition_id text not null,
  is_unique boolean not null default false,
  holder_hero_instance_id uuid,
  equipped_slot integer check (equipped_slot between 1 and 2),
  obtained_round integer not null check (obtained_round between 1 and 8),
  created_at timestamptz not null default now(),
  check (
    (holder_hero_instance_id is null and equipped_slot is null)
    or (holder_hero_instance_id is not null and equipped_slot is not null)
  ),
  unique (id, run_id, tenant_id),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete cascade,
  foreign key (holder_hero_instance_id, run_id, tenant_id)
    references public.run_heroes (id, run_id, tenant_id) on delete restrict
);

create unique index run_items_one_unique_per_run_idx
  on public.run_items (run_id) where is_unique;
create unique index run_items_one_slot_per_hero_idx
  on public.run_items (holder_hero_instance_id, equipped_slot)
  where holder_hero_instance_id is not null;
create unique index run_items_one_unique_per_hero_idx
  on public.run_items (holder_hero_instance_id)
  where holder_hero_instance_id is not null and is_unique;
create index run_items_tenant_run_idx on public.run_items (tenant_id, run_id);

create table public.run_shop_slots (
  run_id uuid not null,
  tenant_id uuid not null,
  shop_round integer not null check (shop_round between 1 and 8),
  refresh_number integer not null check (refresh_number >= 0),
  slot_index integer not null check (slot_index between 0 and 3),
  hero_definition_id text not null,
  purchased_at timestamptz,
  primary key (run_id, shop_round, refresh_number, slot_index),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete cascade
);

create index run_shop_slots_tenant_run_idx on public.run_shop_slots (tenant_id, run_id);

create table public.combat_snapshots (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null,
  round_number integer not null check (round_number between 1 and 8),
  content_version text not null,
  ruleset_version text not null,
  combat_seed_ciphertext bytea not null,
  snapshot_hash text not null check (length(snapshot_hash) = 64),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  unique (run_id, round_number),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete restrict
);

create index combat_snapshots_tenant_run_idx on public.combat_snapshots (tenant_id, run_id);

create table public.combat_events (
  run_id uuid not null,
  tenant_id uuid not null,
  round_number integer not null check (round_number between 1 and 8),
  sequence bigint not null check (sequence >= 0),
  tick integer not null check (tick between 0 and 700),
  event_type text not null,
  source_unit_id text,
  target_unit_id text,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  created_at timestamptz not null default now(),
  primary key (run_id, round_number, sequence),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete restrict
);

create index combat_events_tenant_run_round_sequence_idx
  on public.combat_events (tenant_id, run_id, round_number, sequence);

create table public.run_commands (
  id bigint generated always as identity primary key,
  run_id uuid not null,
  tenant_id uuid not null,
  actor_user_id uuid not null references auth.users(id) on delete restrict,
  command_id uuid not null,
  command_type text not null,
  expected_run_revision bigint not null check (expected_run_revision >= 0),
  payload_hash text not null check (length(payload_hash) = 64),
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  status text not null check (status in ('applied', 'rejected')),
  response jsonb not null check (jsonb_typeof(response) = 'object'),
  resulting_run_revision bigint,
  created_at timestamptz not null default now(),
  unique (run_id, command_id),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete restrict
);

create index run_commands_tenant_run_created_idx
  on public.run_commands (tenant_id, run_id, created_at desc);

create table public.reward_claims (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null,
  tenant_id uuid not null,
  round_number integer not null check (round_number between 1 and 8),
  reward_key text not null,
  idempotency_key text not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  claimed_at timestamptz not null default now(),
  unique (run_id, round_number, reward_key),
  unique (tenant_id, idempotency_key),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete restrict
);

create index reward_claims_tenant_run_idx on public.reward_claims (tenant_id, run_id);

create table public.economy_ledger (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  run_id uuid,
  idempotency_key text not null,
  currency_code text not null check (currency_code in ('gold')),
  delta bigint not null,
  reason text not null,
  correlation_id uuid not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, idempotency_key),
  foreign key (run_id, tenant_id)
    references public.runs (id, tenant_id) on delete restrict
);

create index economy_ledger_tenant_created_idx
  on public.economy_ledger (tenant_id, created_at desc);
create index economy_ledger_run_idx on public.economy_ledger (run_id);

create table public.audit_logs (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text not null,
  request_id uuid,
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now()
);

create index audit_logs_tenant_created_idx on public.audit_logs (tenant_id, created_at desc);

create table public.outbox_events (
  id bigint generated always as identity primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null check (jsonb_typeof(payload) = 'object'),
  occurred_at timestamptz not null default now(),
  delivered_at timestamptz,
  delivery_attempts integer not null default 0 check (delivery_attempts >= 0)
);

create index outbox_events_pending_idx
  on public.outbox_events (occurred_at, id) where delivered_at is null;

alter table public.tenants enable row level security;
alter table public.tenant_memberships enable row level security;
alter table public.runs enable row level security;
alter table public.run_heroes enable row level security;
alter table public.run_items enable row level security;
alter table public.run_shop_slots enable row level security;
alter table public.combat_snapshots enable row level security;
alter table public.combat_events enable row level security;
alter table public.run_commands enable row level security;
alter table public.reward_claims enable row level security;
alter table public.economy_ledger enable row level security;
alter table public.audit_logs enable row level security;
alter table public.outbox_events enable row level security;

create policy tenants_select_member on public.tenants
  for select to authenticated using (public.is_tenant_member(id));
create policy memberships_select_self on public.tenant_memberships
  for select to authenticated using (user_id = auth.uid());

-- Browser clients have no policy on authoritative game tables: no direct read,
-- INSERT, UPDATE or DELETE is possible. Fastify uses a server-only credential
-- and enforces tenant authorization in its application layer before every read
-- and mutation. This also prevents revealing the preselected Unique or seeds.
