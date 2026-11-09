-- Vouchers made in the Voucher Generator. Run once in Supabase → SQL Editor.
create table if not exists public.vouchers (
  id          uuid primary key default gen_random_uuid(),
  trip_id     uuid references public.trips(id) on delete set null,
  client      text not null,
  trip_name   text,
  kind        text not null,          -- hotel | transfer | activity | flight
  title       text not null,
  day         int,
  start_date  date,
  end_date    date,
  details     jsonb not null default '{}'::jsonb,
  source_file text,
  voucher_no  text,
  created_by  uuid references auth.users(id) default auth.uid(),
  created_at  timestamptz not null default now()
);
alter table public.vouchers enable row level security;
create policy "team reads vouchers"  on public.vouchers for select to authenticated using (true);
create policy "team writes vouchers" on public.vouchers for insert to authenticated with check (true);
create policy "team edits vouchers"  on public.vouchers for update to authenticated using (true);
create policy "team removes vouchers" on public.vouchers for delete to authenticated using (true);
create index if not exists vouchers_client_idx on public.vouchers (client);
