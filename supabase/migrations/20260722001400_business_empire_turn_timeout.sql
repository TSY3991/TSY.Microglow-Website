begin;

-- Matches have a turn_deadline_at but nothing previously advanced a match when the
-- current player stalls (disconnects, AFK). Let any seated player force-skip the
-- expired player's turn once the deadline has passed, reusing the same turn-advance
-- logic business_empire_action's end_turn branch uses.
create or replace function public.force_advance_expired_turn(p_match_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller_id uuid := private.require_authenticated_user();
  v_match public.matches;
  v_event_no bigint;
  v_result jsonb;
begin
  if not exists (
    select 1 from public.match_players where match_id = p_match_id and user_id = v_caller_id
  ) then
    raise exception 'Only seated players can force-advance a turn';
  end if;

  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.game_key <> 'microglow-business-empire' or v_match.status <> 'active' then
    raise exception 'Active business empire match required';
  end if;
  if v_match.turn_deadline_at is null or v_match.turn_deadline_at > now() then
    raise exception 'Turn has not expired yet';
  end if;

  if not exists (
    select 1 from public.business_empire_players
    where match_id = p_match_id and user_id = v_match.current_player_id for update
  ) then
    raise exception 'Current player state not found';
  end if;

  update public.business_empire_players set pending_action = null
  where match_id = p_match_id and user_id = v_match.current_player_id;
  update public.matches set phase = 'turn_end' where id = p_match_id;

  v_result := jsonb_build_object('action', 'turn_timeout', 'skipped_user_id', v_match.current_player_id)
    || private.advance_business_turn(p_match_id, v_match.current_player_id);

  v_event_no := private.next_match_event_no(p_match_id);
  insert into public.match_events (match_id, event_no, actor_user_id, event_type, request_id, payload)
  values (p_match_id, v_event_no, v_match.current_player_id, 'turn_timeout', null, v_result);

  return v_result;
end;
$$;

revoke all on function public.force_advance_expired_turn(uuid) from public, anon, authenticated;
grant execute on function public.force_advance_expired_turn(uuid) to authenticated;

commit;
