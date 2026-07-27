begin;

-- A historical room member row must not reserve its seat forever. Active and
-- disconnected members still keep their seats, while left/kicked rows remain
-- available for audit and reconnect decisions.
alter table public.room_members
  drop constraint if exists room_members_seat_unique;

create unique index if not exists room_members_active_seat_unique_idx
  on public.room_members (room_id, seat_number)
  where status in ('invited', 'joined', 'ready', 'disconnected');

create index if not exists match_queue_waiting_expiry_idx
  on public.match_queue (expires_at)
  where status = 'waiting';

create index if not exists room_invites_pending_expiry_idx
  on public.room_invites (expires_at)
  where status = 'pending';

create or replace function public.join_game_room(p_room_code text)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
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

create or replace function private.run_matchmaking_once()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_key text;
  v_map_id uuid;
  v_map public.game_maps;
  v_ids uuid[];
  v_users uuid[];
  v_room_id uuid;
  v_code text;
  v_count integer;
begin
  update public.match_queue
  set status = 'expired'
  where status = 'waiting'
    and expires_at <= now();

  select mq.game_key, mq.map_id
  into v_game_key, v_map_id
  from public.match_queue mq
  join public.game_maps gm
    on gm.id = mq.map_id
   and gm.game_key = mq.game_key
   and gm.is_active
  where mq.status = 'waiting'
    and mq.expires_at > now()
  group by mq.game_key, mq.map_id, gm.min_players
  having count(*) >= gm.min_players
  order by min(mq.queued_at), mq.game_key, mq.map_id
  limit 1;

  if not found then
    return 0;
  end if;

  select *
  into v_map
  from public.game_maps
  where id = v_map_id
    and game_key = v_game_key
    and is_active
  for share;

  if not found then
    return 0;
  end if;

  select array_agg(q.id order by q.queued_at, q.id),
         array_agg(q.user_id order by q.queued_at, q.id)
  into v_ids, v_users
  from (
    select mq.id, mq.user_id, mq.queued_at
    from public.match_queue mq
    where mq.status = 'waiting'
      and mq.game_key = v_game_key
      and mq.map_id = v_map_id
      and mq.expires_at > now()
    order by mq.queued_at, mq.id
    for update skip locked
    limit v_map.max_players
  ) q;

  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < v_map.min_players then
    return 0;
  end if;

  for i in 1..10 loop
    v_code := private.random_room_code();
    begin
      insert into public.game_rooms (
        room_code, game_key, map_id, host_user_id, visibility,
        status, max_players, request_id
      )
      values (
        v_code,
        v_game_key,
        v_map_id,
        v_users[1],
        'private',
        'lobby',
        v_count,
        gen_random_uuid()
      )
      returning id into v_room_id;
      exit;
    exception
      when unique_violation then
        null;
    end;
  end loop;

  if v_room_id is null then
    raise exception using errcode = '55000', message = 'Unable to create matched room';
  end if;

  for i in 1..v_count loop
    insert into public.room_members (
      room_id, user_id, seat_number, status, is_ready
    )
    values (
      v_room_id, v_users[i], i, 'ready', true
    );
  end loop;

  update public.match_queue
  set status = 'matched',
      matched_room_id = v_room_id,
      matched_at = now()
  where id = any(v_ids);

  return v_count;
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
  v_user_id uuid := private.require_user_id();
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

alter table public.game_rooms replica identity full;
alter table public.match_queue replica identity full;

do $$
begin
  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'game_rooms'
  ) then
    alter publication supabase_realtime add table public.game_rooms;
  end if;

  if exists (
    select 1
    from pg_catalog.pg_publication
    where pubname = 'supabase_realtime'
  ) and not exists (
    select 1
    from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_queue'
  ) then
    alter publication supabase_realtime add table public.match_queue;
  end if;
end;
$$;

revoke all on function public.join_game_room(text) from public, anon, authenticated;
revoke all on function public.set_room_ready(uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.invite_friend_to_room(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_room_invite(uuid, boolean, uuid) from public, anon, authenticated;
revoke all on function public.cancel_match_queue(uuid, uuid) from public, anon, authenticated;
revoke all on function public.leave_game_room(uuid, uuid) from public, anon, authenticated;
revoke all on function public.touch_room_presence(uuid) from public, anon, authenticated;
revoke all on function public.start_game_match(uuid, uuid) from public, anon, authenticated;
revoke all on function private.run_matchmaking_once() from public, anon, authenticated;

grant execute on function public.join_game_room(text) to authenticated;
grant execute on function public.set_room_ready(uuid, boolean, jsonb) to authenticated;
grant execute on function public.invite_friend_to_room(uuid, uuid, uuid) to authenticated;
grant execute on function public.respond_room_invite(uuid, boolean, uuid) to authenticated;
grant execute on function public.cancel_match_queue(uuid, uuid) to authenticated;
grant execute on function public.leave_game_room(uuid, uuid) to authenticated;
grant execute on function public.touch_room_presence(uuid) to authenticated;
grant execute on function public.start_game_match(uuid, uuid) to authenticated;

commit;
