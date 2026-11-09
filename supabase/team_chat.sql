-- Team Chat (WhatsApp-style). Run once in Supabase → SQL Editor → Run.
-- Safe to run again: it only adds what's missing and keeps every old message.

-- 1. Chats (groups and one-to-one)
create table if not exists public.chat_rooms (
  id          text primary key,                 -- 'General', a uuid for groups, 'dm:<idA>:<idB>' for one-to-one
  name        text not null,
  kind        text not null default 'group',    -- group | dm
  members     uuid[],                           -- null = the whole team
  description text,
  created_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);
insert into public.chat_rooms (id, name, kind, members) values ('General', 'General', 'group', null) on conflict (id) do nothing;

-- 2. Messages (keeps the existing table and its history)
create table if not exists public.chat_messages (
  id         uuid primary key default gen_random_uuid(),
  sender     text,
  text       text,
  channel    text not null default 'General',
  is_self    boolean default false,
  attachment jsonb,
  created_at timestamptz not null default now()
);
alter table public.chat_messages add column if not exists sender_id   uuid;
alter table public.chat_messages add column if not exists kind        text not null default 'text';   -- text | file | voice | system
alter table public.chat_messages add column if not exists reply_to    text;
alter table public.chat_messages add column if not exists edited_at   timestamptz;
alter table public.chat_messages add column if not exists deleted_at  timestamptz;
alter table public.chat_messages add column if not exists deleted_for uuid[] not null default '{}';
alter table public.chat_messages add column if not exists reactions   jsonb  not null default '{}'::jsonb;
alter table public.chat_messages add column if not exists starred_by  uuid[] not null default '{}';
alter table public.chat_messages add column if not exists pinned_at   timestamptz;
alter table public.chat_messages add column if not exists forwarded   boolean not null default false;
alter table public.chat_messages add column if not exists mentions    uuid[] not null default '{}';
create index if not exists chat_messages_channel_time on public.chat_messages (channel, created_at);

-- 3. Who has read up to where (blue ticks and unread counts)
create table if not exists public.chat_reads (
  room_id      text not null,
  user_id      uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

-- 4. Access: everyone signed in to the dashboard is on the team
alter table public.chat_rooms    enable row level security;
alter table public.chat_messages enable row level security;
alter table public.chat_reads    enable row level security;
do $$ begin
  drop policy if exists "team chat rooms"    on public.chat_rooms;
  drop policy if exists "team chat messages" on public.chat_messages;
  drop policy if exists "team chat reads"    on public.chat_reads;
  drop policy if exists "team reads profiles" on public.profiles;
end $$;
create policy "team chat rooms"    on public.chat_rooms    for all to authenticated using (true) with check (true);
create policy "team chat messages" on public.chat_messages for all to authenticated using (true) with check (true);
create policy "team chat reads"    on public.chat_reads    for all to authenticated using (true) with check (true);
create policy "team reads profiles" on public.profiles     for select to authenticated using (true);

-- 5. Live updates (new messages, edits, reactions appear instantly)
do $$ begin
  begin alter publication supabase_realtime add table public.chat_messages; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_rooms;    exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.chat_reads;    exception when duplicate_object then null; end;
end $$;

-- 6. Photos, files and voice notes (private storage, team only)
insert into storage.buckets (id, name, public) values ('team-chat', 'team-chat', false) on conflict (id) do nothing;
do $$ begin
  drop policy if exists "team chat files read"   on storage.objects;
  drop policy if exists "team chat files upload" on storage.objects;
  drop policy if exists "team chat files delete" on storage.objects;
end $$;
create policy "team chat files read"   on storage.objects for select to authenticated using (bucket_id = 'team-chat');
create policy "team chat files upload" on storage.objects for insert to authenticated with check (bucket_id = 'team-chat');
create policy "team chat files delete" on storage.objects for delete to authenticated using (bucket_id = 'team-chat' and owner = auth.uid());
