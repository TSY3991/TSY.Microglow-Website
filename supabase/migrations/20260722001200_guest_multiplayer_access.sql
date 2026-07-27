begin;

-- Anonymous (guest) users already get a private public.profiles row from
-- private.handle_new_user(). This adds a shareable, non-searchable
-- identifier so a guest can be added as a friend or invited to a room
-- without exposing them to the general username search (is_public stays
-- false for anonymous accounts; player_code is "know it to use it").
alter table public.profiles
  add column player_code text;

create or replace function private.random_player_code()
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_bytes bytea := extensions.gen_random_bytes(6);
  v_code text := '';
begin
  for i in 0..5 loop
    v_code := v_code || substr(v_chars, (get_byte(v_bytes, i) % length(v_chars)) + 1, 1);
  end loop;
  return v_code;
end;
$$;

do $$
declare
  v_profile record;
  v_code text;
begin
  for v_profile in select id from public.profiles where player_code is null loop
    loop
      v_code := private.random_player_code();
      begin
        update public.profiles set player_code = v_code where id = v_profile.id;
        exit;
      exception when unique_violation then
        null;
      end;
    end loop;
  end loop;
end;
$$;

alter table public.profiles
  alter column player_code set not null;
create unique index profiles_player_code_unique_idx on public.profiles (player_code);

-- private.handle_new_user() now also assigns a player_code to every new
-- account (permanent or anonymous) so the code is always available.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  loop
    v_code := private.random_player_code();
    begin
      insert into public.profiles (id, display_name, is_public, player_code)
      values (
        new.id,
        left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '微光旅人'), 40),
        not coalesce(new.is_anonymous, false),
        v_code
      );
      exit;
    exception when unique_violation then
      null;
    end;
  end loop;
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

-- Guest (anonymous) accounts may now use room/matchmaking RPCs and the
-- code-based friend invite below. private.require_user_id() keeps
-- delegating to private.require_permanent_user() for everything else
-- (username-search friend invites, business_empire_action, admin RPCs).
create or replace function private.require_authenticated_user()
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
  return v_user_id;
end;
$$;

create or replace function public.send_friend_invite_by_code(p_player_code text, p_request_id uuid)
returns public.friend_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_receiver_id uuid;
  v_invite public.friend_invites;
begin
  select * into v_invite from public.friend_invites
  where sender_id = v_user_id and request_id = p_request_id;
  if found then return v_invite; end if;

  select id into v_receiver_id from public.profiles
  where player_code = upper(trim(p_player_code));
  if v_receiver_id is null then raise exception 'Player code not found'; end if;
  if v_receiver_id = v_user_id then raise exception 'Cannot invite yourself'; end if;
  if private.are_friends(v_user_id, v_receiver_id) then raise exception 'Already friends'; end if;

  insert into public.friend_invites (sender_id, receiver_id, request_id)
  values (v_user_id, v_receiver_id, p_request_id)
  returning * into v_invite;
  insert into public.notifications (user_id, actor_id, module, event_type, title, data)
  values (v_receiver_id, v_user_id, 'social', 'friend_invite', '收到好友邀請', jsonb_build_object('invite_id', v_invite.id));
  return v_invite;
exception
  when unique_violation then
    raise exception 'A pending friend invite already exists';
end;
$$;

create or replace function public.respond_friend_invite(p_invite_id uuid, p_accept boolean)
returns public.friend_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_invite public.friend_invites;
begin
  select * into v_invite from public.friend_invites where id = p_invite_id for update;
  if not found or v_invite.receiver_id <> v_user_id then raise exception 'Invite not found'; end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then raise exception 'Invite is no longer pending'; end if;
  update public.friend_invites
  set status = case when p_accept then 'accepted'::public.friend_invite_status else 'declined'::public.friend_invite_status end,
      responded_at = now()
  where id = p_invite_id returning * into v_invite;
  if p_accept then
    insert into public.friendships (user_a, user_b)
    values (least(v_invite.sender_id, v_invite.receiver_id), greatest(v_invite.sender_id, v_invite.receiver_id))
    on conflict do nothing;
  end if;
  return v_invite;
end;
$$;

create or replace function public.create_game_room(
  p_game_key text,
  p_map_key text,
  p_visibility public.room_visibility,
  p_max_players smallint,
  p_request_id uuid
)
returns public.game_rooms
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_map public.game_maps;
  v_room public.game_rooms;
  v_code text;
begin
  select * into v_room from public.game_rooms
  where host_user_id = v_user_id and request_id = p_request_id;
  if found then return v_room; end if;
  select * into v_map from public.game_maps
  where game_key = p_game_key and map_key = p_map_key and is_active for share;
  if not found then raise exception 'Map not found'; end if;
  if p_max_players < v_map.min_players or p_max_players > v_map.max_players or p_max_players > 4 then
    raise exception 'Player limit is outside map constraints';
  end if;
  for i in 1..10 loop
    v_code := private.random_room_code();
    begin
      insert into public.game_rooms (room_code, game_key, map_id, host_user_id, visibility, max_players, request_id)
      values (v_code, p_game_key, v_map.id, v_user_id, p_visibility, p_max_players, p_request_id)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if exists (select 1 from public.game_rooms where host_user_id = v_user_id and request_id = p_request_id) then
        select * into v_room from public.game_rooms where host_user_id = v_user_id and request_id = p_request_id;
        return v_room;
      end if;
    end;
  end loop;
  if v_room.id is null then raise exception 'Unable to allocate room code'; end if;
  insert into public.room_members (room_id, user_id, seat_number, status, is_ready)
  values (v_room.id, v_user_id, 1, 'joined', false);
  return v_room;
end;
$$;

create or replace function public.join_game_room(p_room_code text)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_room public.game_rooms;
  v_member public.room_members;
  v_member_exists boolean;
  v_count integer;
  v_seat smallint;
  v_has_invite boolean;
begin
  select *
  into v_room
  from public.game_rooms
  where room_code = upper(trim(p_room_code))
  for update;

  if not found or v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Room is not joinable';
  end if;

  select *
  into v_member
  from public.room_members
  where room_id = v_room.id
    and user_id = v_user_id;
  v_member_exists := found;

  if v_member_exists and v_member.status in ('joined', 'ready') then
    update public.room_members
    set last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user_id
    returning * into v_member;
    return v_member;
  end if;

  if v_member_exists and v_member.status = 'disconnected' then
    update public.room_members
    set status = case
          when is_ready then 'ready'::public.room_member_status
          else 'joined'::public.room_member_status
        end,
        disconnected_at = null,
        left_at = null,
        last_seen_at = now()
    where room_id = v_room.id
      and user_id = v_user_id
    returning * into v_member;
    return v_member;
  end if;

  select exists (
    select 1
    from public.room_invites ri
    where ri.room_id = v_room.id
      and ri.receiver_id = v_user_id
      and ri.status = 'pending'
      and ri.expires_at > now()
  )
  into v_has_invite;

  if v_room.visibility = 'friends'
     and not private.are_friends(v_user_id, v_room.host_user_id) then
    raise exception using errcode = '42501', message = 'Room is limited to friends';
  end if;

  if v_room.visibility = 'private' and not v_has_invite then
    raise exception using errcode = '42501', message = 'Room invitation required';
  end if;

  if v_member_exists and v_member.status = 'kicked' and not v_has_invite then
    raise exception using errcode = '42501', message = 'New room invitation required';
  end if;

  select count(*)
  into v_count
  from public.room_members
  where room_id = v_room.id
    and status in ('invited', 'joined', 'ready', 'disconnected');

  if v_count >= v_room.max_players then
    raise exception using errcode = '55000', message = 'Room is full';
  end if;

  select min(s)::smallint
  into v_seat
  from generate_series(1, v_room.max_players) s
  where not exists (
    select 1
    from public.room_members rm
    where rm.room_id = v_room.id
      and rm.seat_number = s
      and rm.status in ('invited', 'joined', 'ready', 'disconnected')
  );

  if v_seat is null then
    raise exception using errcode = '55000', message = 'Room is full';
  end if;

  if v_member_exists then
    update public.room_members
    set seat_number = v_seat,
        status = 'joined',
        is_ready = false,
        joined_at = now(),
        last_seen_at = now(),
        disconnected_at = null,
        left_at = null
    where room_id = v_room.id
      and user_id = v_user_id
    returning * into v_member;
  else
    insert into public.room_members (
      room_id, user_id, seat_number, status, is_ready
    )
    values (
      v_room.id, v_user_id, v_seat, 'joined', false
    )
    returning * into v_member;
  end if;

  update public.room_invites
  set status = 'accepted',
      responded_at = now()
  where room_id = v_room.id
    and receiver_id = v_user_id
    and status = 'pending';

  return v_member;
end;
$$;

create or replace function public.set_room_ready(
  p_room_id uuid,
  p_ready boolean,
  p_loadout jsonb default '{}'::jsonb
)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_room public.game_rooms;
  v_member public.room_members;
begin
  if jsonb_typeof(p_loadout) <> 'object' then
    raise exception using errcode = '22023', message = 'Loadout must be an object';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Room is not in lobby state';
  end if;

  update public.room_members
  set is_ready = p_ready,
      status = case
        when p_ready then 'ready'::public.room_member_status
        else 'joined'::public.room_member_status
      end,
      loadout = p_loadout,
      last_seen_at = now()
  where room_id = p_room_id
    and user_id = v_user_id
    and status in ('joined', 'ready')
  returning * into v_member;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  return v_member;
end;
$$;

create or replace function public.invite_friend_to_room(
  p_room_id uuid,
  p_receiver_id uuid,
  p_request_id uuid
)
returns public.room_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_room public.game_rooms;
  v_invite public.room_invites;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select *
  into v_invite
  from public.room_invites
  where sender_id = v_user_id
    and request_id = p_request_id;
  if found then
    return v_invite;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found or v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Room is not in lobby state';
  end if;

  if not exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = v_user_id
      and rm.status in ('joined', 'ready', 'disconnected')
  ) then
    raise exception using errcode = '42501', message = 'Room membership required';
  end if;

  if not private.are_friends(v_user_id, p_receiver_id) then
    raise exception using errcode = '42501', message = 'Receiver is not a friend';
  end if;

  if exists (
    select 1
    from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = p_receiver_id
      and rm.status in ('invited', 'joined', 'ready', 'disconnected')
  ) then
    raise exception using errcode = '55000', message = 'Receiver is already a room member';
  end if;

  insert into public.room_invites (
    room_id, sender_id, receiver_id, request_id
  )
  values (
    p_room_id, v_user_id, p_receiver_id, p_request_id
  )
  returning * into v_invite;

  insert into public.notifications (
    user_id, actor_id, module, event_type, title, data
  )
  values (
    p_receiver_id,
    v_user_id,
    'games',
    'room_invite',
    '收到房間邀請',
    jsonb_build_object('room_id', p_room_id, 'invite_id', v_invite.id)
  );

  return v_invite;
exception
  when unique_violation then
    raise exception using errcode = '23505', message = 'A pending room invite already exists';
end;
$$;

create or replace function public.respond_room_invite(
  p_invite_id uuid,
  p_accept boolean,
  p_request_id uuid
)
returns public.room_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_scope text := 'respond_room_invite:' || p_invite_id::text;
  v_saved jsonb;
  v_room_id uuid;
  v_room public.game_rooms;
  v_invite public.room_invites;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;

  if found then
    select *
    into v_invite
    from public.room_invites
    where id = (v_saved ->> 'invite_id')::uuid;
    return v_invite;
  end if;

  select room_id
  into v_room_id
  from public.room_invites
  where id = p_invite_id
    and receiver_id = v_user_id;

  if not found then
    raise exception using errcode = '42501', message = 'Room invite not found';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = v_room_id
  for update;

  select *
  into v_invite
  from public.room_invites
  where id = p_invite_id
    and receiver_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Room invite not found';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;

  if found then
    select *
    into v_invite
    from public.room_invites
    where id = (v_saved ->> 'invite_id')::uuid;
    return v_invite;
  end if;

  if v_invite.status = 'accepted' then
    if not p_accept then
      raise exception using errcode = '55000', message = 'Invite already answered';
    end if;
  elsif v_invite.status = 'declined' then
    if p_accept then
      raise exception using errcode = '55000', message = 'Invite already answered';
    end if;
  elsif v_invite.status in ('cancelled', 'expired') then
    null;
  elsif v_invite.expires_at <= now() then
    update public.room_invites
    set status = 'expired',
        responded_at = now()
    where id = p_invite_id
    returning * into v_invite;
  elsif v_room.status <> 'lobby' then
    update public.room_invites
    set status = 'cancelled',
        responded_at = now()
    where id = p_invite_id
    returning * into v_invite;
  elsif not p_accept then
    update public.room_invites
    set status = 'declined',
        responded_at = now()
    where id = p_invite_id
    returning * into v_invite;
  else
    perform public.join_game_room(v_room.room_code);
    select *
    into v_invite
    from public.room_invites
    where id = p_invite_id;
  end if;

  insert into private.idempotency_keys (
    user_id, scope, request_id, response
  )
  values (
    v_user_id,
    v_scope,
    p_request_id,
    jsonb_build_object('invite_id', v_invite.id)
  );

  return v_invite;
end;
$$;

create or replace function public.cancel_match_queue(
  p_queue_id uuid,
  p_request_id uuid
)
returns public.match_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_scope text := 'cancel_match_queue:' || p_queue_id::text;
  v_saved jsonb;
  v_queue public.match_queue;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;

  if found then
    select *
    into v_queue
    from public.match_queue
    where id = (v_saved ->> 'queue_id')::uuid;
    return v_queue;
  end if;

  select *
  into v_queue
  from public.match_queue
  where id = p_queue_id
    and user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Match queue not found';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;

  if found then
    select *
    into v_queue
    from public.match_queue
    where id = (v_saved ->> 'queue_id')::uuid;
    return v_queue;
  end if;

  if v_queue.status = 'matched' then
    raise exception using errcode = '55000', message = 'Match already assigned';
  elsif v_queue.status = 'waiting' then
    update public.match_queue
    set status = case
          when expires_at <= now() then 'expired'::public.queue_status
          else 'cancelled'::public.queue_status
        end
    where id = p_queue_id
    returning * into v_queue;
  end if;

  insert into private.idempotency_keys (
    user_id, scope, request_id, response
  )
  values (
    v_user_id,
    v_scope,
    p_request_id,
    jsonb_build_object('queue_id', v_queue.id)
  );

  return v_queue;
end;
$$;

create or replace function public.leave_game_room(
  p_room_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_scope text := 'leave_game_room:' || p_room_id::text;
  v_saved jsonb;
  v_room public.game_rooms;
  v_new_host public.room_members;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;
  if found then
    return v_saved;
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  select response
  into v_saved
  from private.idempotency_keys
  where user_id = v_user_id
    and scope = v_scope
    and request_id = p_request_id;
  if found then
    return v_saved;
  end if;

  if v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Only lobby rooms can be left';
  end if;

  perform 1
  from public.room_members
  where room_id = p_room_id
    and user_id = v_user_id
    and status in ('joined', 'ready', 'disconnected')
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  update public.room_members
  set status = 'left',
      is_ready = false,
      left_at = now(),
      disconnected_at = null,
      last_seen_at = now()
  where room_id = p_room_id
    and user_id = v_user_id;

  if v_room.host_user_id = v_user_id then
    select *
    into v_new_host
    from public.room_members
    where room_id = p_room_id
      and user_id <> v_user_id
      and status in ('joined', 'ready')
    order by seat_number
    for update
    limit 1;

    if found then
      update public.game_rooms
      set host_user_id = v_new_host.user_id
      where id = p_room_id
      returning * into v_room;

      insert into public.notifications (
        user_id, actor_id, module, event_type, title, data
      )
      values (
        v_new_host.user_id,
        v_user_id,
        'games',
        'room_host_transferred',
        '您已成為房主',
        jsonb_build_object('room_id', p_room_id, 'previous_host_user_id', v_user_id)
      );
    else
      update public.game_rooms
      set status = 'abandoned',
          closed_at = now()
      where id = p_room_id
      returning * into v_room;

      update public.room_invites
      set status = 'cancelled',
          responded_at = now()
      where room_id = p_room_id
        and status = 'pending';
    end if;
  end if;

  v_result := jsonb_build_object(
    'room_id', p_room_id,
    'member_status', 'left',
    'room_status', v_room.status,
    'new_host_user_id', case
      when v_room.status = 'lobby' then v_room.host_user_id
      else null
    end
  );

  insert into private.idempotency_keys (
    user_id, scope, request_id, response
  )
  values (
    v_user_id, v_scope, p_request_id, v_result
  );

  return v_result;
end;
$$;

create or replace function public.touch_room_presence(p_room_id uuid)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_room public.game_rooms;
  v_member public.room_members;
begin
  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for share;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;
  if v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Room presence is only available in lobby';
  end if;

  update public.room_members
  set status = case
        when status = 'disconnected' and is_ready then 'ready'::public.room_member_status
        when status = 'disconnected' then 'joined'::public.room_member_status
        else status
      end,
      last_seen_at = now(),
      disconnected_at = null
  where room_id = p_room_id
    and user_id = v_user_id
    and status in ('joined', 'ready', 'disconnected')
  returning * into v_member;

  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  return v_member;
end;
$$;

create or replace function public.enqueue_match(p_game_key text, p_map_key text, p_request_id uuid)
returns public.match_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_map_id uuid;
  v_queue public.match_queue;
begin
  select * into v_queue from public.match_queue where user_id = v_user_id and request_id = p_request_id;
  if found then return v_queue; end if;
  select id into v_map_id from public.game_maps where game_key = p_game_key and map_key = p_map_key and is_active;
  if v_map_id is null then raise exception 'Map not found'; end if;
  insert into public.match_queue (user_id, game_key, map_id, request_id)
  values (v_user_id, p_game_key, v_map_id, p_request_id) returning * into v_queue;
  return v_queue;
exception when unique_violation then
  raise exception 'User is already waiting for a match';
end;
$$;

create or replace function public.start_game_match(
  p_room_id uuid,
  p_request_id uuid
)
returns public.matches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_room public.game_rooms;
  v_match public.matches;
  v_member record;
  v_character public.business_empire_characters;
  v_count integer;
  v_min_players integer;
  v_map_max_players integer;
  v_first_user uuid;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select *
  into v_room
  from public.game_rooms
  where id = p_room_id
  for update;

  if not found or v_room.host_user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'Room host required';
  end if;

  if v_room.status <> 'lobby' then
    if v_room.current_match_id is not null then
      select *
      into v_match
      from public.matches
      where id = v_room.current_match_id;
      return v_match;
    end if;
    raise exception using errcode = '55000', message = 'Room is not in lobby state';
  end if;

  select min_players, max_players
  into v_min_players, v_map_max_players
  from public.game_maps
  where id = v_room.map_id
    and game_key = v_room.game_key
    and is_active
  for share;

  if not found then
    raise exception using errcode = '55000', message = 'Active game map required';
  end if;

  select count(*)
  into v_count
  from public.room_members
  where room_id = p_room_id
    and status in ('joined', 'ready', 'disconnected');

  if v_count < v_min_players
     or v_count > least(v_room.max_players, v_map_max_players) then
    raise exception using errcode = '55000', message = 'Room player count is invalid';
  end if;

  if exists (
    select 1
    from public.room_members
    where room_id = p_room_id
      and status in ('joined', 'ready', 'disconnected')
      and (status <> 'ready' or not is_ready)
  ) then
    raise exception using errcode = '55000', message = 'All players must be ready';
  end if;

  select user_id
  into v_first_user
  from public.room_members
  where room_id = p_room_id
    and status = 'ready'
    and is_ready
  order by seat_number
  limit 1;

  insert into public.matches (
    room_id, game_key, map_id, status, phase, current_player_id,
    turn_number, turn_started_at, turn_deadline_at, started_at, state
  )
  values (
    p_room_id,
    v_room.game_key,
    v_room.map_id,
    'active',
    'roll',
    v_first_user,
    1,
    now(),
    now() + interval '45 seconds',
    now(),
    jsonb_build_object('start_request_id', p_request_id)
  )
  returning * into v_match;

  insert into public.match_players (
    match_id, user_id, seat_number
  )
  select v_match.id, user_id, seat_number
  from public.room_members
  where room_id = p_room_id
    and status = 'ready'
    and is_ready;

  if v_room.game_key = 'microglow-business-empire' then
    for v_member in
      select rm.*
      from public.room_members rm
      where rm.room_id = p_room_id
        and rm.status = 'ready'
        and rm.is_ready
    loop
      select *
      into v_character
      from public.business_empire_characters
      where character_key = coalesce(
          v_member.loadout ->> 'character_key',
          'starlight-merchant'
        )
        and is_active;

      if not found then
        raise exception using errcode = '22023', message = 'Invalid business empire character';
      end if;

      insert into public.business_empire_players (
        match_id, user_id, character_key, cash_balance,
        salary, base_expense, skill_level
      )
      values (
        v_match.id,
        v_member.user_id,
        v_character.character_key,
        v_character.starting_cash,
        v_character.salary,
        v_character.base_expense,
        v_character.starting_skill
      );
    end loop;
  end if;

  update public.game_rooms
  set status = 'in_progress',
      current_match_id = v_match.id
  where id = p_room_id;

  insert into public.match_events (
    match_id, event_no, event_type, request_id, payload
  )
  values (
    v_match.id,
    1,
    'match_started',
    p_request_id,
    jsonb_build_object('current_player_id', v_first_user)
  );

  return v_match;
end;
$$;

revoke all on function public.send_friend_invite_by_code(text, uuid) from public, anon, authenticated;
grant execute on function public.send_friend_invite_by_code(text, uuid) to authenticated;

-- guest_access_hardening added a blanket "permanent members only" RESTRICTIVE
-- read/write gate on these tables. The RPC gate changes above only relax the
-- write side (functions run security definer, already bypassing RLS); reads
-- still went through PostgREST as the calling role, so a guest could write
-- via RPC but never see their own invites/room/queue afterwards. Drop the
-- gate on just the six tables a guest needs to read for the lobby; the
-- existing ownership-scoped permissive policies (participants/members only)
-- still apply, so this does not expose any other user's rows. Match/business
-- gameplay tables keep the permanent-only gate untouched.
drop policy if exists friendships_permanent_gate on public.friendships;
drop policy if exists friend_invites_permanent_gate on public.friend_invites;
drop policy if exists game_rooms_permanent_gate on public.game_rooms;
drop policy if exists room_members_permanent_gate on public.room_members;
drop policy if exists room_invites_permanent_gate on public.room_invites;
drop policy if exists match_queue_permanent_gate on public.match_queue;

commit;
