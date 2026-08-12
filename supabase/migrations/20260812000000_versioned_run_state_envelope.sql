-- Canonical persistence envelope for production-4x6.
-- The application performs the 4x8 compatibility mapping before returning a
-- row. NOT VALID keeps existing legacy rows from being silently rewritten.
drop index if exists public.authoritative_run_states_one_active_per_tenant_idx;

-- Replace the initial root-level identity checks with view-level checks. The
-- generated names below are PostgreSQL's default names for the initial table.
alter table public.authoritative_run_states
  drop constraint if exists authoritative_run_states_run_state_check,
  drop constraint if exists authoritative_run_states_check,
  drop constraint if exists authoritative_run_states_check1,
  drop constraint if exists authoritative_run_states_check2;

alter table public.authoritative_run_states
  add constraint authoritative_run_states_run_state_object_check
  check (jsonb_typeof(run_state) = 'object');

create unique index authoritative_run_states_one_active_per_tenant_idx
  on public.authoritative_run_states (tenant_id)
  where coalesce(run_state -> 'view' ->> 'state', run_state ->> 'state') in ('PREPARE', 'COMBAT', 'REWARD');

alter table public.authoritative_run_states
  add constraint authoritative_run_states_schema_version_check
  check (run_state ->> 'schema_version' in ('production-4x6-0.1.0', 'alpha-0.3.0'))
  not valid;

alter table public.authoritative_run_states
  add constraint authoritative_run_states_envelope_identity_check
  check (
    (run_state -> 'view' ->> 'id') = run_id
    and (run_state -> 'view' ->> 'tenantId') = tenant_id::text
    and ((run_state -> 'view' ->> 'revision')::bigint) = revision
  )
  not valid;

comment on column public.authoritative_run_states.run_state is
  'Versioned envelope: {schema_version, view}. Legacy alpha-0.3.0 rows are read only through the explicit 4x8 compatibility boundary.';
