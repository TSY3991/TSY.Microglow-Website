begin;

create schema if not exists extensions;
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;

create type public.friend_invite_status as enum ('pending', 'accepted', 'declined', 'cancelled', 'expired');
create type public.room_visibility as enum ('public', 'friends', 'private');
create type public.room_status as enum ('lobby', 'matching', 'in_progress', 'completed', 'abandoned');
create type public.room_member_status as enum ('invited', 'joined', 'ready', 'disconnected', 'left', 'kicked');
create type public.queue_status as enum ('waiting', 'matched', 'cancelled', 'expired');
create type public.match_status as enum ('pending', 'active', 'completed', 'abandoned');
create type public.match_player_status as enum ('active', 'disconnected', 'eliminated', 'finished', 'left');
create type public.radar_source_kind as enum ('store', 'marketplace', 'api', 'manual');
create type public.radar_source_status as enum ('active', 'degraded', 'paused', 'disabled');
create type public.radar_price_kind as enum ('regular', 'special', 'online');
create type public.radar_alert_status as enum ('pending', 'sent', 'read', 'dismissed', 'failed');

create table private.idempotency_keys (
  user_id uuid not null references auth.users(id) on delete cascade,
  scope text not null,
  request_id uuid not null,
  response jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, scope, request_id)
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username extensions.citext unique,
  display_name text not null default '微光旅人',
  avatar_path text,
  is_public boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username::text ~ '^[A-Za-z0-9_]{3,24}$'),
  constraint profiles_display_name_length check (char_length(display_name) between 1 and 40)
);

create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'zh-TW',
  timezone text not null default 'Asia/Taipei',
  email_notifications boolean not null default true,
  game_invites boolean not null default true,
  radar_alerts boolean not null default true,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint user_settings_preferences_object check (jsonb_typeof(preferences) = 'object')
);

create table public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint friendships_canonical_order check (user_a < user_b),
  constraint friendships_unique_pair unique (user_a, user_b)
);

create table public.friend_invites (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status public.friend_invite_status not null default 'pending',
  request_id uuid not null,
  expires_at timestamptz not null default (now() + interval '14 days'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint friend_invites_not_self check (sender_id <> receiver_id),
  constraint friend_invites_request_unique unique (sender_id, request_id)
);
create unique index friend_invites_one_pending_pair_idx
  on public.friend_invites (least(sender_id, receiver_id), greatest(sender_id, receiver_id))
  where status = 'pending';
create index friend_invites_receiver_status_idx on public.friend_invites (receiver_id, status, created_at desc);
create index friend_invites_sender_status_idx on public.friend_invites (sender_id, status, created_at desc);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  module text not null,
  event_type text not null,
  title text not null,
  body text,
  data jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_data_object check (jsonb_typeof(data) = 'object')
);
create index notifications_user_created_idx on public.notifications (user_id, created_at desc);
create index notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create table public.achievements (
  id uuid primary key default gen_random_uuid(),
  achievement_key text not null unique,
  module text not null,
  title text not null,
  description text not null,
  icon_path text,
  points integer not null default 0 check (points >= 0),
  is_active boolean not null default true,
  criteria jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_achievements (
  user_id uuid not null references auth.users(id) on delete cascade,
  achievement_id uuid not null references public.achievements(id) on delete cascade,
  progress integer not null default 0 check (progress >= 0),
  unlocked_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, achievement_id)
);
create index user_achievements_user_unlocked_idx on public.user_achievements (user_id, unlocked_at desc);

create table public.portal_apps (
  id uuid primary key default gen_random_uuid(),
  app_key text not null unique,
  title text not null,
  description text,
  url text not null,
  category text not null,
  icon_path text,
  sort_order integer not null default 0,
  is_published boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_apps_published_sort_idx on public.portal_apps (is_published, sort_order, title);

create table public.portal_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  link_url text,
  published_at timestamptz,
  expires_at timestamptz,
  is_published boolean not null default false,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index portal_announcements_public_idx on public.portal_announcements (published_at desc)
  where is_published = true;

create table public.portal_activity (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  app_key text,
  activity_type text not null,
  idempotency_key uuid not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint portal_activity_idempotent unique (user_id, idempotency_key)
);
create index portal_activity_user_time_idx on public.portal_activity (user_id, occurred_at desc);

commit;
