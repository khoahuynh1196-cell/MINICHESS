-- Authoritative state keeps the evolving Alpha RunRecord atomically durable.
-- The existing normalized tables remain available for projections and audit.
create table public.authoritative_run_states (
  run_id text primary key,
  tenant_id uuid not null references public.tenants(id) on delete restrict,
  revision bigint not null check (revision >= 0),
  run_state jsonb not null check (jsonb_typeof(run_state) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((run_state ->> 'id') = run_id),
  check ((run_state ->> 'tenantId') = tenant_id::text),
  check (((run_state ->> 'revision')::bigint) = revision)
);

create index authoritative_run_states_tenant_updated_idx
  on public.authoritative_run_states (tenant_id, updated_at desc);

create unique index authoritative_run_states_one_active_per_tenant_idx
  on public.authoritative_run_states (tenant_id)
  where run_state ->> 'state' in ('PREPARE', 'COMBAT', 'REWARD');

alter table public.authoritative_run_states enable row level security;
-- Browser clients never query this table. Server requests authenticate and
-- authorize tenant membership before using a server-only DB connection.
