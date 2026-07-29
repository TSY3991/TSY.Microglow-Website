begin;

-- leave_game_room only allows leaving lobby-state rooms, so once a room
-- transitions to in_progress a disconnected/AFK player has no way out and
-- their old membership row keeps hijacking the multiplayer lobby UI (which
-- reads it as "you are still in a live match"). abandon_room_membership lets
-- any active member drop themselves from any room state, and — when the room
-- was already tied to a match — also flags them as left in match_players so
-- the remaining players can advance the game.
create or replace function public.abandon_room_membership(
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
  v_scope text := 'abandon_room_membership:' || p_room_id::text;
  v_saved jsonb;
  v_room public.game_rooms;
  v_new_host public.room_members;
  v_result jsonb;
begin
  if p_request_id is null then
    raise exception using errcode = '22023', message = 'Request ID is required';
  end if;

  select response into v_saved from private.idempotency_keys
  where user_id = v_user_id and scope = v_scope and request_id = p_request_id;
  if found then return v_saved; end if;

  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  perform 1 from public.room_members
  where room_id = p_room_id and user_id = v_user_id
    and status in ('joined', 'ready', 'disconnected')
  for update;
  if not found then
    raise exception using errcode = '42501', message = 'Active room membership required';
  end if;

  update public.room_members
  set status = 'left', is_ready = false, left_at = now(),
      disconnected_at = null, last_seen_at = now()
  where room_id = p_room_id and user_id = v_user_id;

  -- If the room already spun up a match, drop the caller from it too.
  if v_room.current_match_id is not null then
    update public.match_players
    set status = 'left'
    where match_id = v_room.current_match_id
      and user_id = v_user_id
      and status = 'active';
  end if;

  -- Host handoff / room close (only in lobby state; in-progress rooms are
  -- driven by match_players from here on, host role no longer matters).
  if v_room.status = 'lobby' and v_room.host_user_id = v_user_id then
    select * into v_new_host from public.room_members
    where room_id = p_room_id and user_id <> v_user_id
      and status in ('joined', 'ready')
    order by seat_number
    for update
    limit 1;
    if found then
      update public.game_rooms set host_user_id = v_new_host.user_id
      where id = p_room_id returning * into v_room;
    else
      update public.game_rooms set status = 'abandoned', closed_at = now()
      where id = p_room_id returning * into v_room;
      update public.room_invites set status = 'cancelled', responded_at = now()
      where room_id = p_room_id and status = 'pending';
    end if;
  end if;

  v_result := jsonb_build_object(
    'room_id', p_room_id,
    'member_status', 'left',
    'room_status', v_room.status
  );

  insert into private.idempotency_keys (user_id, scope, request_id, response)
  values (v_user_id, v_scope, p_request_id, v_result);

  return v_result;
end;
$$;

revoke all on function public.abandon_room_membership(uuid, uuid) from public, anon, authenticated;
grant execute on function public.abandon_room_membership(uuid, uuid) to authenticated;

commit;
