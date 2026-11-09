-- Desktop notifications. Run once in Supabase → SQL Editor → Run (after team_chat.sql).
-- Then deploy the push-notify Edge Function (see the steps in the chat).

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- 1. Which browsers want notifications (each person manages their own)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "own push subscriptions" on public.push_subscriptions;
create policy "own push subscriptions" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 2. Private settings: a secret so only Supabase can trigger notifications, and the push keys
--    (made automatically on first use). No one can read this table from the dashboard.
create table if not exists public.push_config (
  id            int primary key default 1 check (id = 1),
  hook_secret   text not null default replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''),
  vapid_public  text,
  vapid_private text
);
insert into public.push_config (id) values (1) on conflict (id) do nothing;
alter table public.push_config enable row level security;

-- 3. New chat message or new lead → send notifications
create or replace function public.push_notify_hook() returns trigger
language plpgsql security definer set search_path = public as $$
declare s text;
begin
  select hook_secret into s from public.push_config where id = 1;
  perform net.http_post(
    url     := 'https://hwegfrcnznuofzdorssd.supabase.co/functions/v1/push-notify',
    body    := jsonb_build_object('type', TG_OP, 'table', TG_TABLE_NAME, 'record', to_jsonb(NEW)),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', s));
  return NEW;
end $$;

drop trigger if exists push_on_chat on public.chat_messages;
create trigger push_on_chat after insert on public.chat_messages for each row execute function public.push_notify_hook();
drop trigger if exists push_on_lead on public.contacts;
create trigger push_on_lead after insert on public.contacts for each row execute function public.push_notify_hook();

-- 4. Every morning at 9:00 India time: trips leaving in 7, 3, 1 days, today, and coming back today
do $$ begin perform cron.unschedule('push-daily'); exception when others then null; end $$;
select cron.schedule('push-daily', '30 3 * * *', $cron$
  select net.http_post(
    url     := 'https://hwegfrcnznuofzdorssd.supabase.co/functions/v1/push-notify',
    body    := '{"type":"daily"}'::jsonb,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-hook-secret', (select hook_secret from public.push_config where id = 1)));
$cron$);
