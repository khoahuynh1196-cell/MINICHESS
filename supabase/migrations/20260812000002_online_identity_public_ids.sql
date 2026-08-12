-- Keep the server-generated public player id stable while durable foreign keys
-- remain UUIDs. The online runtime must resolve public_id to player_id inside
-- the same transaction as ticket, room, and command writes.
alter table public.online_identities
  add column if not exists public_id text;

update public.online_identities
set public_id = 'guest_' || player_id::text
where public_id is null;

alter table public.online_identities
  alter column public_id set default ('guest_' || gen_random_uuid()::text),
  alter column public_id set not null;

create unique index if not exists online_identities_public_id_idx
  on public.online_identities(public_id);

comment on column public.online_identities.public_id is
  'Immutable server-generated public player id (for example guest_<uuid>); use player_id for durable foreign keys.';
