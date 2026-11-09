-- Gmail auto-check for the Suppliers page.
-- Run once in Supabase → SQL Editor. Safe to run again.
--
-- 1. Adds subject, sender and a short note to each email the check reads (the "Recent emails" list).
-- 2. Creates a private settings table holding a random secret, so only this timer can start a check.
-- 3. Schedules the check: every 5 minutes from 8:00am to 11:00pm India time, once an hour overnight.
--    Each run wakes the free Render server, reads new Gmail and files supplier rates.

create extension if not exists pg_cron;
create extension if not exists pg_net;

alter table public.gmail_processed_emails add column if not exists subject text;
alter table public.gmail_processed_emails add column if not exists sender  text;
alter table public.gmail_processed_emails add column if not exists note    text;
create index if not exists gmail_processed_emails_user_created on public.gmail_processed_emails (user_id, created_at desc);

create table if not exists public.app_config (key text primary key, value text not null);
alter table public.app_config enable row level security;   -- no policies: only the server can read it
insert into public.app_config (key, value)
values ('gmail_cron_secret', md5(random()::text || clock_timestamp()::text) || md5(random()::text))
on conflict (key) do nothing;

create or replace function public.gmail_check_now() returns void
language sql security definer set search_path = public as $$
  select net.http_post(
    url     := 'https://custom-holidays.onrender.com/api/gmail/cron',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'X-Cron-Secret', (select value from public.app_config where key = 'gmail_cron_secret')),
    body    := '{}'::jsonb,
    timeout_milliseconds := 90000
  );
$$;
revoke all on function public.gmail_check_now() from public, anon, authenticated;

do $$ begin perform cron.unschedule('gmail-day-a'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('gmail-day-b'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('gmail-night'); exception when others then null; end $$;

-- Times are UTC. India is UTC + 5:30.
select cron.schedule('gmail-day-a', '30-55/5 2 * * *',        $c$ select public.gmail_check_now(); $c$);  -- 8:00–8:25am IST
select cron.schedule('gmail-day-b', '*/5 3-17 * * *',         $c$ select public.gmail_check_now(); $c$);  -- 8:30am–11:25pm IST
select cron.schedule('gmail-night', '30 18-23,0-1 * * *',     $c$ select public.gmail_check_now(); $c$);  -- hourly overnight
