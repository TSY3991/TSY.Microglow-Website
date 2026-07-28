begin;

-- The host has never had a way to remove a stuck/unwanted member from a lobby room,
-- even though room_member_status already had a 'kicked' value reserved for this.
-- Mirrors leave_game_room's idempotency_keys + row-lock pattern, but the host acts on
-- someone else's seat instead of their own.
create or replace function public.remove_room_member(
  p_room_id uuid,
  p_target_user_id uuid,
  p_request_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_scope text := 'remove_room_member:' || p_room_id::text;
  v_saved jsonb;
  v_room public.game_rooms;
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

  if not found or v_room.host_user_id <> v_user_id then
    raise exception using errcode = '42501', message = 'Room host required';
  end if;

  if v_room.status <> 'lobby' then
    raise exception using errcode = '55000', message = 'Only lobby rooms allow removing members';
  end if;

  if p_target_user_id = v_user_id then
    raise exception using errcode = '22023', message = 'Use leave_game_room to leave your own room';
  end if;

  perform 1
  from public.room_members
  where room_id = p_room_id
    and user_id = p_target_user_id
    and status in ('joined', 'ready', 'disconnected')
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'Target is not an active room member';
  end if;

  update public.room_members
  set status = 'kicked',
      is_ready = false,
      left_at = now(),
      disconnected_at = null,
      last_seen_at = now()
  where room_id = p_room_id
    and user_id = p_target_user_id;

  insert into public.notifications (
    user_id, actor_id, module, event_type, title, data
  )
  values (
    p_target_user_id,
    v_user_id,
    'games',
    'room_member_kicked',
    '您已被移出房間',
    jsonb_build_object('room_id', p_room_id)
  );

  v_result := jsonb_build_object(
    'room_id', p_room_id,
    'target_user_id', p_target_user_id,
    'member_status', 'kicked'
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

revoke all on function public.remove_room_member(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.remove_room_member(uuid, uuid, uuid) to authenticated;

-- friend_invite_status already had a 'cancelled' value reserved; the sender previously
-- had no way to withdraw an invite they regretted sending. Mirrors respond_friend_invite's
-- simple row-lock style (no idempotency_keys needed, same as its sibling).
create or replace function public.cancel_friend_invite(p_invite_id uuid)
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
  if not found or v_invite.sender_id <> v_user_id then raise exception 'Invite not found'; end if;
  if v_invite.status <> 'pending' or v_invite.expires_at <= now() then raise exception 'Invite is no longer pending'; end if;
  update public.friend_invites
  set status = 'cancelled', responded_at = now()
  where id = p_invite_id
  returning * into v_invite;
  return v_invite;
end;
$$;

revoke all on function public.cancel_friend_invite(uuid) from public, anon, authenticated;
grant execute on function public.cancel_friend_invite(uuid) to authenticated;

commit;
