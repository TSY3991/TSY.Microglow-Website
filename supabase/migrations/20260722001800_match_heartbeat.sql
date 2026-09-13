begin;

-- Client-driven presence heartbeat. Connected-multiplayer players call this
-- every ~10 seconds so their own last_seen_at stays fresh, and the response
-- carries every seat's last_seen_at back so the UI can flag peers that have
-- gone quiet (currently we only notice disconnects when the 45-second turn
-- deadline expires — this closes the "opponent looks fine but is gone" gap).
create or replace function public.match_heartbeat(
  p_match_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_match public.matches;
  v_players jsonb;
begin
  select * into v_match from public.matches where id = p_match_id;
  if not found then
    raise exception using errcode = '42501', message = 'Active match membership required';
  end if;

  perform 1 from public.match_players
  where match_id = p_match_id and user_id = v_user_id
    and status in ('active', 'disconnected');
  if not found then
    raise exception using errcode = '42501', message = 'Active match membership required';
  end if;

  update public.match_players
  set last_seen_at = now(),
      is_connected = true,
      disconnected_at = null
  where match_id = p_match_id and user_id = v_user_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'user_id', user_id,
           'seat_number', seat_number,
           'status', status,
           'is_connected', is_connected,
           'last_seen_at', last_seen_at
         ) order by seat_number), '[]'::jsonb)
    into v_players
  from public.match_players
  where match_id = p_match_id;

  return jsonb_build_object(
    'now', now(),
    'match_status', v_match.status,
    'players', v_players
  );
end;
$$;

revoke all on function public.match_heartbeat(uuid) from public, anon, authenticated;
grant execute on function public.match_heartbeat(uuid) to authenticated;

commit;
