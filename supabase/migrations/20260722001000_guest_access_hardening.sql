begin;

-- Anonymous Auth users receive the authenticated Postgres role. Keep identity
-- checks in one place so existing SECURITY DEFINER RPCs cannot accidentally
-- treat a guest as a permanent platform member.
create or replace function private.is_anonymous_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
$$;

create or replace function private.is_permanent_user()
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select auth.uid() is not null and not private.is_anonymous_user()
$$;

create or replace function private.require_anonymous_user()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if not private.is_anonymous_user() then
    raise exception using errcode = '42501', message = 'Anonymous account required';
  end if;
  return v_user_id;
end;
$$;

create or replace function private.require_permanent_user()
returns uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception using errcode = '28000', message = 'Authentication required';
  end if;
  if private.is_anonymous_user() then
    raise exception using errcode = '42501', message = 'Permanent account required';
  end if;
  return v_user_id;
end;
$$;

-- All existing public member/admin RPCs already call require_user_id().
-- Preserve that API while hardening its semantics for anonymous JWTs.
create or replace function private.require_user_id()
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select private.require_permanent_user()
$$;

-- Anonymous profiles are private by default. After manual identity linking,
-- the same UID can explicitly opt in to a public profile.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name, is_public)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '微光旅人'), 40),
    not coalesce(new.is_anonymous, false)
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create type public.guest_play_status as enum ('active', 'completed', 'expired', 'abandoned');

create table public.guest_play_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null references public.game_definitions(game_key) on delete restrict,
  status public.guest_play_status not null default 'active',
  request_id uuid not null,
  started_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  expires_at timestamptz not null,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint guest_play_sessions_request_unique unique (user_id, request_id),
  constraint guest_play_sessions_owner_unique unique (id, user_id),
  constraint guest_play_sessions_expiry_after_start check (expires_at > started_at),
  constraint guest_play_sessions_completion_consistent check (
    (status = 'active' and completed_at is null)
    or (status <> 'active' and completed_at is not null)
  )
);
create unique index guest_play_sessions_one_active_idx
  on public.guest_play_sessions (user_id, game_key)
  where status = 'active';
create index guest_play_sessions_user_time_idx
  on public.guest_play_sessions (user_id, created_at desc);
create index guest_play_sessions_expiry_idx
  on public.guest_play_sessions (expires_at)
  where status = 'active';

-- These events are non-authoritative telemetry/intents only. Dice, assets,
-- wins and ranking must continue to be decided by dedicated server functions.
create table public.guest_play_events (
  id bigint generated always as identity primary key,
  session_id uuid not null,
  user_id uuid not null,
  event_no bigint not null check (event_no > 0),
  intent_type text not null,
  request_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guest_play_events_session_fk foreign key (session_id, user_id)
    references public.guest_play_sessions(id, user_id) on delete cascade,
  constraint guest_play_events_number_unique unique (session_id, event_no),
  constraint guest_play_events_request_unique unique (session_id, request_id),
  constraint guest_play_events_intent_allowed check (
    intent_type in ('roll_intent', 'decision_intent', 'end_turn_intent', 'heartbeat')
  ),
  constraint guest_play_events_payload_object check (jsonb_typeof(payload) = 'object'),
  constraint guest_play_events_payload_size check (octet_length(payload::text) <= 8192)
);
create index guest_play_events_session_time_idx
  on public.guest_play_events (session_id, event_no);
create index guest_play_events_user_time_idx
  on public.guest_play_events (user_id, created_at desc);

create table public.guest_play_results (
  session_id uuid primary key,
  user_id uuid not null,
  completion_request_id uuid not null,
  result_code text not null default 'trial_completed' check (result_code = 'trial_completed'),
  event_count integer not null check (event_count >= 0),
  duration_seconds integer not null check (duration_seconds >= 0),
  summary jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint guest_play_results_session_fk foreign key (session_id, user_id)
    references public.guest_play_sessions(id, user_id) on delete cascade,
  constraint guest_play_results_request_unique unique (user_id, completion_request_id),
  constraint guest_play_results_summary_object check (jsonb_typeof(summary) = 'object')
);
create index guest_play_results_user_time_idx
  on public.guest_play_results (user_id, created_at desc);

alter table public.guest_play_sessions enable row level security;
alter table public.guest_play_events enable row level security;
alter table public.guest_play_results enable row level security;

create policy guest_play_sessions_owner_read
on public.guest_play_sessions for select to authenticated
using (user_id = (select auth.uid()));

create policy guest_play_events_owner_read
on public.guest_play_events for select to authenticated
using (user_id = (select auth.uid()));

create policy guest_play_results_owner_read
on public.guest_play_results for select to authenticated
using (user_id = (select auth.uid()));

revoke all privileges on public.guest_play_sessions from anon, authenticated;
revoke all privileges on public.guest_play_events from anon, authenticated;
revoke all privileges on public.guest_play_results from anon, authenticated;
revoke all privileges on sequence public.guest_play_events_id_seq from anon, authenticated;
grant select on public.guest_play_sessions to authenticated;
grant select on public.guest_play_events to authenticated;
grant select on public.guest_play_results to authenticated;

create or replace function public.start_guest_play_session(
  p_game_key text,
  p_request_id uuid,
  p_ttl_minutes integer default 120
)
returns public.guest_play_sessions
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_anonymous_user();
  v_session public.guest_play_sessions;
begin
  if p_ttl_minutes not between 15 and 240 then
    raise exception using errcode = '22023', message = 'Guest session TTL must be between 15 and 240 minutes';
  end if;
  if not exists (
    select 1 from public.game_definitions gd
    where gd.game_key = p_game_key and gd.is_active
  ) then
    raise exception using errcode = '22023', message = 'Active game required';
  end if;

  select * into v_session
  from public.guest_play_sessions
  where user_id = v_user_id and request_id = p_request_id;
  if found then
    return v_session;
  end if;

  select * into v_session
  from public.guest_play_sessions
  where user_id = v_user_id and game_key = p_game_key and status = 'active'
  for update;
  if found then
    if v_session.expires_at <= now() then
      update public.guest_play_sessions
      set status = 'expired', completed_at = now(), last_activity_at = now()
      where id = v_session.id;
    else
      return v_session;
    end if;
  end if;

  begin
    insert into public.guest_play_sessions (
      user_id, game_key, request_id, expires_at
    ) values (
      v_user_id, p_game_key, p_request_id, now() + make_interval(mins => p_ttl_minutes)
    )
    returning * into v_session;
  exception
    when unique_violation then
      select * into v_session
      from public.guest_play_sessions
      where user_id = v_user_id
        and (request_id = p_request_id or (game_key = p_game_key and status = 'active'))
      order by (request_id = p_request_id) desc
      limit 1;
      if not found then
        raise;
      end if;
  end;
  return v_session;
end;
$$;

create or replace function public.append_guest_play_event(
  p_session_id uuid,
  p_intent_type text,
  p_request_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns public.guest_play_events
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_anonymous_user();
  v_session public.guest_play_sessions;
  v_event public.guest_play_events;
  v_event_no bigint;
begin
  if p_intent_type not in ('roll_intent', 'decision_intent', 'end_turn_intent', 'heartbeat') then
    raise exception using errcode = '22023', message = 'Unsupported guest intent type';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' or octet_length(p_payload::text) > 8192 then
    raise exception using errcode = '22023', message = 'Guest intent payload must be an object up to 8192 bytes';
  end if;

  select * into v_session
  from public.guest_play_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Guest session owner required';
  end if;
  if v_session.status <> 'active' then
    raise exception using errcode = '22023', message = 'Active guest session required';
  end if;
  if v_session.expires_at <= now() then
    update public.guest_play_sessions
    set status = 'expired', completed_at = now(), last_activity_at = now()
    where id = p_session_id;
    raise exception using errcode = '22023', message = 'Guest session expired';
  end if;

  select * into v_event
  from public.guest_play_events
  where session_id = p_session_id and request_id = p_request_id;
  if found then
    return v_event;
  end if;

  select coalesce(max(event_no), 0) + 1 into v_event_no
  from public.guest_play_events
  where session_id = p_session_id;

  insert into public.guest_play_events (
    session_id, user_id, event_no, intent_type, request_id, payload
  ) values (
    p_session_id, v_user_id, v_event_no, p_intent_type, p_request_id, p_payload
  )
  returning * into v_event;

  update public.guest_play_sessions
  set last_activity_at = now()
  where id = p_session_id;
  return v_event;
end;
$$;

create or replace function public.complete_guest_play_session(
  p_session_id uuid,
  p_request_id uuid
)
returns public.guest_play_results
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_anonymous_user();
  v_session public.guest_play_sessions;
  v_result public.guest_play_results;
  v_event_count integer;
  v_duration integer;
begin
  select * into v_result
  from public.guest_play_results
  where user_id = v_user_id and completion_request_id = p_request_id;
  if found then
    return v_result;
  end if;

  select * into v_session
  from public.guest_play_sessions
  where id = p_session_id and user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Guest session owner required';
  end if;
  if v_session.status = 'completed' then
    select * into v_result from public.guest_play_results where session_id = p_session_id;
    return v_result;
  end if;
  if v_session.status <> 'active' or v_session.expires_at <= now() then
    raise exception using errcode = '22023', message = 'Active guest session required';
  end if;

  select count(*)::integer into v_event_count
  from public.guest_play_events where session_id = p_session_id;
  if v_event_count = 0 then
    raise exception using errcode = '22023', message = 'At least one guest intent is required';
  end if;
  v_duration := greatest(0, floor(extract(epoch from (now() - v_session.started_at)))::integer);

  insert into public.guest_play_results (
    session_id, user_id, completion_request_id, event_count, duration_seconds, summary
  ) values (
    p_session_id,
    v_user_id,
    p_request_id,
    v_event_count,
    v_duration,
    jsonb_build_object(
      'record_type', 'non_authoritative_trial',
      'event_count', v_event_count,
      'duration_seconds', v_duration
    )
  )
  returning * into v_result;

  update public.guest_play_sessions
  set status = 'completed', completed_at = now(), last_activity_at = now()
  where id = p_session_id;
  return v_result;
end;
$$;

create or replace function private.expire_guest_play_sessions(
  p_now timestamptz default now(),
  p_retention interval default interval '30 days'
)
returns table(expired_count integer, purged_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expired integer;
  v_purged integer;
begin
  if p_retention < interval '1 day' then
    raise exception using errcode = '22023', message = 'Guest retention must be at least one day';
  end if;

  update public.guest_play_sessions
  set status = 'expired', completed_at = p_now, last_activity_at = p_now
  where status = 'active' and expires_at <= p_now;
  get diagnostics v_expired = row_count;

  delete from public.guest_play_sessions
  where status in ('completed', 'expired', 'abandoned')
    and completed_at < p_now - p_retention;
  get diagnostics v_purged = row_count;

  return query select v_expired, v_purged;
end;
$$;

-- A guest may only see/update the minimum profile row attached to its UID.
-- Permanent members retain the original public/friend profile behaviour.
create policy profiles_anonymous_self_gate
on public.profiles
as restrictive
for all
to authenticated
using (private.is_permanent_user() or id = (select auth.uid()))
with check (
  private.is_permanent_user()
  or (
    id = (select auth.uid())
    and username is null
    and is_public = false
  )
);

-- These tables are platform-member features. Public catalog/reference tables
-- intentionally remain readable so a guest can render a trial experience.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'user_settings',
    'friendships',
    'friend_invites',
    'notifications',
    'user_achievements',
    'portal_activity',
    'game_rooms',
    'room_members',
    'room_invites',
    'match_queue',
    'matches',
    'match_players',
    'match_events',
    'player_records',
    'business_empire_players',
    'business_empire_owned_assets',
    'radar_watchlists',
    'radar_alerts'
  ]
  loop
    execute format(
      'create policy %I on public.%I as restrictive for all to authenticated using (private.is_permanent_user()) with check (private.is_permanent_user())',
      v_table || '_permanent_gate',
      v_table
    );
  end loop;
end;
$$;

-- Keep public media readable, but prevent an authenticated anonymous user from
-- uploading, replacing or deleting Storage objects.
create policy storage_permanent_insert_gate
on storage.objects as restrictive for insert to authenticated
with check (private.is_permanent_user());
create policy storage_permanent_update_gate
on storage.objects as restrictive for update to authenticated
using (private.is_permanent_user()) with check (private.is_permanent_user());
create policy storage_permanent_delete_gate
on storage.objects as restrictive for delete to authenticated
using (private.is_permanent_user());

-- The cloud project may contain this event-trigger function even when the
-- local stack does not. Event-trigger execution does not require API callers to
-- retain EXECUTE privilege.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end;
$$;

revoke all on function public.start_guest_play_session(text, uuid, integer) from public, anon, authenticated;
revoke all on function public.append_guest_play_event(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.complete_guest_play_session(uuid, uuid) from public, anon, authenticated;
grant execute on function public.start_guest_play_session(text, uuid, integer) to authenticated;
grant execute on function public.append_guest_play_event(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.complete_guest_play_session(uuid, uuid) to authenticated;

revoke all on function private.is_anonymous_user() from public, anon, authenticated;
revoke all on function private.is_permanent_user() from public, anon, authenticated;
revoke all on function private.require_anonymous_user() from public, anon, authenticated;
revoke all on function private.require_permanent_user() from public, anon, authenticated;
revoke all on function private.expire_guest_play_sessions(timestamptz, interval) from public, anon, authenticated;
grant execute on function private.is_anonymous_user() to authenticated;
grant execute on function private.is_permanent_user() to authenticated;

select cron.unschedule(jobid)
from cron.job
where jobname = 'microglow-expire-guest-sessions';
select cron.schedule(
  'microglow-expire-guest-sessions',
  '*/15 * * * *',
  'select private.expire_guest_play_sessions();'
);

commit;
