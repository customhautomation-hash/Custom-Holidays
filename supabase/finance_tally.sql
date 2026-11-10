-- Finance page ← Tally.
-- Run once in Supabase → SQL Editor. Safe to run again.
-- Stores the figures the Tally Connector sends from the finance PC, and private settings
-- (the connector's key and the monthly targets). Only the server can read or write these.

create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;

create table if not exists public.tally_snapshots (
  id          bigint generated always as identity primary key,
  company     text,
  as_of       date,
  summary     jsonb not null,
  received_at timestamptz not null default now()
);
create index if not exists tally_snapshots_received on public.tally_snapshots (received_at desc);
alter table public.tally_snapshots enable row level security;   -- no policies: staff read figures through the server, after signing in
