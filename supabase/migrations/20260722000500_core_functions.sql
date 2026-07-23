begin;

create or replace function private.require_user_id()
returns uuid
language plpgsql
stable
security definer
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

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((auth.jwt() -> 'app_metadata' ->> 'role') = 'admin', false)
$$;

create or replace function private.are_friends(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.friendships f
    where f.user_a = least(p_user_a, p_user_b)
      and f.user_b = greatest(p_user_a, p_user_b)
  )
$$;

create or replace function private.is_room_member(p_room_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.room_members rm
    where rm.room_id = p_room_id
      and rm.user_id = p_user_id
      and rm.status in ('joined', 'ready', 'disconnected')
  )
$$;

create or replace function private.is_match_player(p_match_id uuid, p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user_id is not null and exists (
    select 1 from public.match_players mp
    where mp.match_id = p_match_id and mp.user_id = p_user_id
  )
$$;

create or replace function private.touch_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_touch_updated_at before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger user_settings_touch_updated_at before update on public.user_settings
for each row execute function private.touch_updated_at();
create trigger achievements_touch_updated_at before update on public.achievements
for each row execute function private.touch_updated_at();
create trigger user_achievements_touch_updated_at before update on public.user_achievements
for each row execute function private.touch_updated_at();
create trigger portal_apps_touch_updated_at before update on public.portal_apps
for each row execute function private.touch_updated_at();
create trigger portal_announcements_touch_updated_at before update on public.portal_announcements
for each row execute function private.touch_updated_at();
create trigger game_definitions_touch_updated_at before update on public.game_definitions
for each row execute function private.touch_updated_at();
create trigger game_maps_touch_updated_at before update on public.game_maps
for each row execute function private.touch_updated_at();
create trigger game_rooms_touch_updated_at before update on public.game_rooms
for each row execute function private.touch_updated_at();
create trigger matches_touch_updated_at before update on public.matches
for each row execute function private.touch_updated_at();
create trigger radar_sources_touch_updated_at before update on public.radar_sources
for each row execute function private.touch_updated_at();
create trigger radar_products_touch_updated_at before update on public.radar_products
for each row execute function private.touch_updated_at();
create trigger radar_source_products_touch_updated_at before update on public.radar_source_products
for each row execute function private.touch_updated_at();
create trigger radar_watchlists_touch_updated_at before update on public.radar_watchlists
for each row execute function private.touch_updated_at();

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    left(coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), '微光旅人'), 40)
  );
  insert into public.user_settings (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function private.handle_new_user();

create or replace function public.send_friend_invite(p_receiver_id uuid, p_request_id uuid)
returns public.friend_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_invite public.friend_invites;
begin
  select * into v_invite from public.friend_invites
  where sender_id = v_user_id and request_id = p_request_id;
  if found then return v_invite; end if;
  if p_receiver_id = v_user_id then raise exception 'Cannot invite yourself'; end if;
  if not exists (select 1 from public.profiles where id = p_receiver_id) then
    raise exception 'Receiver not found';
  end if;
  if private.are_friends(v_user_id, p_receiver_id) then raise exception 'Already friends'; end if;
  insert into public.friend_invites (sender_id, receiver_id, request_id)
  values (v_user_id, p_receiver_id, p_request_id)
  returning * into v_invite;
  insert into public.notifications (user_id, actor_id, module, event_type, title, data)
  values (p_receiver_id, v_user_id, 'social', 'friend_invite', '收到好友邀請', jsonb_build_object('invite_id', v_invite.id));
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
  v_user_id uuid := private.require_user_id();
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

create or replace function private.random_room_code()
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
  v_user_id uuid := private.require_user_id();
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
  v_user_id uuid := private.require_user_id();
  v_room public.game_rooms;
  v_member public.room_members;
  v_count integer;
  v_seat smallint;
begin
  select * into v_room from public.game_rooms
  where room_code = upper(trim(p_room_code)) for update;
  if not found or v_room.status <> 'lobby' then raise exception 'Room is not joinable'; end if;
  select * into v_member from public.room_members where room_id = v_room.id and user_id = v_user_id;
  if found then
    if v_member.status in ('left', 'disconnected') then
      update public.room_members set status = 'joined', disconnected_at = null, left_at = null, last_seen_at = now()
      where room_id = v_room.id and user_id = v_user_id returning * into v_member;
    end if;
    return v_member;
  end if;
  if v_room.visibility = 'friends' and not private.are_friends(v_user_id, v_room.host_user_id) then
    raise exception 'Room is limited to friends';
  end if;
  if v_room.visibility = 'private' and not exists (
    select 1 from public.room_invites ri
    where ri.room_id = v_room.id and ri.receiver_id = v_user_id
      and ri.status = 'pending' and ri.expires_at > now()
  ) then raise exception 'Room invitation required'; end if;
  select count(*) into v_count from public.room_members
  where room_id = v_room.id and status in ('joined', 'ready', 'disconnected');
  if v_count >= v_room.max_players then raise exception 'Room is full'; end if;
  select min(s)::smallint into v_seat from generate_series(1, v_room.max_players) s
  where not exists (select 1 from public.room_members rm where rm.room_id = v_room.id and rm.seat_number = s and rm.status in ('joined', 'ready', 'disconnected'));
  if v_seat is null then raise exception 'Room is full'; end if;
  insert into public.room_members (room_id, user_id, seat_number)
  values (v_room.id, v_user_id, v_seat) returning * into v_member;
  update public.room_invites set status = 'accepted', responded_at = now()
  where room_id = v_room.id and receiver_id = v_user_id and status = 'pending';
  return v_member;
end;
$$;

create or replace function public.set_room_ready(p_room_id uuid, p_ready boolean, p_loadout jsonb default '{}'::jsonb)
returns public.room_members
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_member public.room_members;
begin
  if jsonb_typeof(p_loadout) <> 'object' then raise exception 'Loadout must be an object'; end if;
  update public.room_members
  set is_ready = p_ready,
      status = case when p_ready then 'ready'::public.room_member_status else 'joined'::public.room_member_status end,
      loadout = p_loadout,
      last_seen_at = now()
  where room_id = p_room_id and user_id = v_user_id and status in ('joined', 'ready')
  returning * into v_member;
  if not found then raise exception 'Active room membership required'; end if;
  return v_member;
end;
$$;

create or replace function public.invite_friend_to_room(p_room_id uuid, p_receiver_id uuid, p_request_id uuid)
returns public.room_invites
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_invite public.room_invites;
begin
  select * into v_invite from public.room_invites where sender_id = v_user_id and request_id = p_request_id;
  if found then return v_invite; end if;
  if not private.is_room_member(p_room_id, v_user_id) then raise exception 'Room membership required'; end if;
  if not private.are_friends(v_user_id, p_receiver_id) then raise exception 'Receiver is not a friend'; end if;
  insert into public.room_invites (room_id, sender_id, receiver_id, request_id)
  values (p_room_id, v_user_id, p_receiver_id, p_request_id) returning * into v_invite;
  insert into public.notifications (user_id, actor_id, module, event_type, title, data)
  values (p_receiver_id, v_user_id, 'games', 'room_invite', '收到房間邀請', jsonb_build_object('room_id', p_room_id, 'invite_id', v_invite.id));
  return v_invite;
exception when unique_violation then
  raise exception 'A pending room invite already exists';
end;
$$;

create or replace function public.enqueue_match(p_game_key text, p_map_key text, p_request_id uuid)
returns public.match_queue
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
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

create or replace function public.set_match_connection(p_match_id uuid, p_connected boolean)
returns public.match_players
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_player public.match_players;
begin
  update public.match_players
  set is_connected = p_connected,
      status = case when p_connected then 'active'::public.match_player_status else 'disconnected'::public.match_player_status end,
      last_seen_at = now(),
      disconnected_at = case when p_connected then null else now() end
  where match_id = p_match_id and user_id = v_user_id and status in ('active', 'disconnected')
  returning * into v_player;
  if not found then raise exception 'Match player not found'; end if;
  return v_player;
end;
$$;

create or replace function private.next_match_event_no(p_match_id uuid)
returns bigint
language sql
volatile
security definer
set search_path = ''
as $$
  select coalesce(max(event_no), 0) + 1 from public.match_events where match_id = p_match_id
$$;

commit;
