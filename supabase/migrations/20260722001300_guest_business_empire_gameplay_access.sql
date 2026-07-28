begin;

-- Guests can already create/join rooms and start a Business Empire match.
-- Let the same authenticated guest session play the server-authoritative match
-- and read its own gameplay rows. Ownership-scoped RLS remains in force.
create or replace function public.business_empire_action(
  p_match_id uuid,
  p_action_type text,
  p_request_id uuid,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_authenticated_user();
  v_match public.matches;
  v_player public.business_empire_players;
  v_tile public.game_map_tiles;
  v_asset public.business_empire_asset_catalog;
  v_owned public.business_empire_owned_assets;
  v_existing jsonb;
  v_result jsonb := '{}'::jsonb;
  v_dice integer;
  v_length integer;
  v_price bigint;
  v_amount bigint;
  v_index integer;
  v_fin record;
  v_event_no bigint;
  v_pending jsonb;
begin
  select payload into v_existing from public.match_events
  where match_id = p_match_id and actor_user_id = v_user_id and request_id = p_request_id;
  if found then return v_existing; end if;
  select * into v_match from public.matches where id = p_match_id for update;
  if not found or v_match.game_key <> 'microglow-business-empire' or v_match.status <> 'active' then
    raise exception 'Active business empire match required';
  end if;
  if v_match.current_player_id <> v_user_id then raise exception 'It is not your turn'; end if;
  if v_match.turn_deadline_at <= now() then raise exception 'Turn deadline has passed'; end if;
  select * into v_player from public.business_empire_players
  where match_id = p_match_id and user_id = v_user_id for update;
  if v_player.eliminated then raise exception 'Player has been eliminated'; end if;

  if p_action_type = 'roll' then
    if v_match.phase <> 'roll' then raise exception 'Roll is not allowed in the current phase'; end if;
    v_dice := private.secure_d6();
    select count(*) into v_length from public.game_map_tiles where map_id = v_match.map_id and zone = v_player.board_zone;
    if v_length = 0 then raise exception 'Map zone has no server-side tiles'; end if;
    v_player.board_position := (v_player.board_position + v_dice) % v_length;
    select * into v_tile from public.game_map_tiles
    where map_id = v_match.map_id and zone = v_player.board_zone and position = v_player.board_position;
    if v_tile.tile_type in ('stock', 'real_estate', 'business') then
      select * into v_asset from public.business_empire_asset_catalog
      where zone = v_player.board_zone and asset_type = v_tile.tile_type and is_active order by random() limit 1;
      v_price := round(v_asset.purchase_price * (1 - least(0.10, v_player.skill_level * 0.02)))::bigint;
      v_pending := jsonb_build_object('type', 'asset_offer', 'asset_key', v_asset.asset_key, 'price', v_price);
      update public.matches set phase = 'decision' where id = p_match_id;
    elsif v_tile.tile_type = 'loan' then
      v_pending := jsonb_build_object('type', 'bank');
      update public.matches set phase = 'decision' where id = p_match_id;
    elsif v_tile.tile_type = 'learn' then
      v_amount := case when v_player.board_zone = 'elite' then 5000 else 2500 end;
      v_pending := jsonb_build_object('type', 'learn', 'cost', v_amount);
      update public.matches set phase = 'decision' where id = p_match_id;
    elsif v_tile.tile_type = 'gate' then
      select * into v_fin from private.business_empire_financials(p_match_id, v_user_id);
      v_pending := jsonb_build_object('type', 'gate', 'qualified',
        v_player.board_zone = 'elite' or v_fin.passive_income >= v_fin.monthly_expense * 0.55 or v_fin.net_worth >= 250000 or v_player.skill_level >= 4);
      update public.matches set phase = 'decision' where id = p_match_id;
    else
      if v_tile.tile_type in ('income', 'expense', 'destiny') then
        v_index := floor(random() * jsonb_array_length(v_tile.config -> 'amounts'))::integer;
        v_amount := (v_tile.config -> 'amounts' ->> v_index)::bigint;
        if v_tile.tile_type = 'expense' then
          v_amount := -round(abs(v_amount) * (1 - least(0.30, v_player.skill_level * 0.04)))::bigint;
        end if;
      elsif v_tile.tile_type = 'risk' then
        v_amount := floor(random() * ((v_tile.config ->> 'max_amount')::bigint - (v_tile.config ->> 'min_amount')::bigint + 1))::bigint + (v_tile.config ->> 'min_amount')::bigint;
        if random() >= least(0.75, 0.48 + v_player.skill_level * 0.05) then v_amount := -v_amount; end if;
      else
        v_amount := 0;
      end if;
      update public.business_empire_players set cash_balance = cash_balance + v_amount, pending_action = null,
        board_position = v_player.board_position where match_id = p_match_id and user_id = v_user_id;
      update public.matches set phase = 'turn_end' where id = p_match_id;
    end if;
    update public.business_empire_players set board_position = v_player.board_position, pending_action = v_pending
    where match_id = p_match_id and user_id = v_user_id;
    v_result := jsonb_build_object('action', 'roll', 'dice', v_dice, 'zone', v_player.board_zone,
      'position', v_player.board_position, 'tile_type', v_tile.tile_type, 'tile_label', v_tile.label,
      'cash_change', coalesce(v_amount, 0), 'pending_action', v_pending);

  elsif p_action_type = 'buy_asset' then
    v_pending := v_player.pending_action;
    if v_match.phase <> 'decision' or v_pending ->> 'type' <> 'asset_offer' then raise exception 'No asset offer is pending'; end if;
    select * into v_asset from public.business_empire_asset_catalog where asset_key = v_pending ->> 'asset_key' for share;
    v_price := (v_pending ->> 'price')::bigint;
    if v_player.cash_balance < v_price then raise exception 'Insufficient cash'; end if;
    insert into public.business_empire_owned_assets (match_id, user_id, asset_key, paid_price, board_zone, board_position)
    values (p_match_id, v_user_id, v_asset.asset_key, v_price, v_player.board_zone, v_player.board_position)
    returning * into v_owned;
    update public.business_empire_players set cash_balance = cash_balance - v_price, pending_action = null
    where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'buy_asset', 'asset_id', v_owned.id, 'asset_key', v_asset.asset_key, 'paid_price', v_price);

  elsif p_action_type = 'sell_asset' then
    select * into v_owned from public.business_empire_owned_assets
    where id = (p_payload ->> 'asset_id')::uuid and match_id = p_match_id and user_id = v_user_id for update;
    if not found then raise exception 'Owned asset not found'; end if;
    select * into v_asset from public.business_empire_asset_catalog where asset_key = v_owned.asset_key;
    v_amount := greatest(0, round(v_asset.asset_value * 0.70)::bigint - v_asset.loan_principal);
    update public.business_empire_players set cash_balance = cash_balance + v_amount,
      bank_debt = bank_debt + greatest(0, v_asset.loan_principal - round(v_asset.asset_value * 0.70)::bigint)
    where match_id = p_match_id and user_id = v_user_id;
    delete from public.business_empire_owned_assets where id = v_owned.id;
    v_result := jsonb_build_object('action', 'sell_asset', 'asset_id', v_owned.id, 'proceeds', v_amount);

  elsif p_action_type = 'learn' then
    if v_match.phase <> 'decision' or v_player.pending_action ->> 'type' <> 'learn' then raise exception 'Learning is not pending'; end if;
    v_amount := (v_player.pending_action ->> 'cost')::bigint;
    if v_player.cash_balance < v_amount then raise exception 'Insufficient cash'; end if;
    update public.business_empire_players set cash_balance = cash_balance - v_amount,
      skill_level = skill_level + 1, pending_action = null where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'learn', 'cost', v_amount);

  elsif p_action_type = 'borrow' then
    if v_match.phase <> 'decision' or v_player.pending_action ->> 'type' <> 'bank' then raise exception 'Bank action is not pending'; end if;
    select * into v_fin from private.business_empire_financials(p_match_id, v_user_id);
    if v_fin.credit_available < 18000 then raise exception 'Insufficient credit'; end if;
    update public.business_empire_players set cash_balance = cash_balance + 15000,
      bank_debt = bank_debt + 18000, pending_action = null where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'borrow', 'cash_received', 15000, 'debt_added', 18000);

  elsif p_action_type = 'repay' then
    if v_match.phase <> 'decision' or v_player.pending_action ->> 'type' <> 'bank' then raise exception 'Bank action is not pending'; end if;
    v_amount := least(5000, v_player.cash_balance, v_player.bank_debt);
    if v_amount <= 0 then raise exception 'No repayable debt'; end if;
    update public.business_empire_players set cash_balance = cash_balance - v_amount,
      bank_debt = bank_debt - v_amount, pending_action = null where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'repay', 'amount', v_amount);

  elsif p_action_type = 'enter_elite' then
    if v_match.phase <> 'decision' or v_player.pending_action ->> 'type' <> 'gate'
      or coalesce((v_player.pending_action ->> 'qualified')::boolean, false) = false then raise exception 'Elite entry is not allowed'; end if;
    update public.business_empire_players set board_zone = 'elite', board_position = 0, pending_action = null
    where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'enter_elite', 'zone', 'elite', 'position', 0);

  elsif p_action_type = 'skip' then
    if v_match.phase <> 'decision' then raise exception 'No decision is pending'; end if;
    update public.business_empire_players set pending_action = null where match_id = p_match_id and user_id = v_user_id;
    update public.matches set phase = 'turn_end' where id = p_match_id;
    v_result := jsonb_build_object('action', 'skip');

  elsif p_action_type = 'end_turn' then
    if v_match.phase <> 'turn_end' then raise exception 'Turn cannot end in the current phase'; end if;
    v_result := jsonb_build_object('action', 'end_turn') || private.advance_business_turn(p_match_id, v_user_id);
  else
    raise exception 'Unsupported action type';
  end if;

  v_event_no := private.next_match_event_no(p_match_id);
  insert into public.match_events (match_id, event_no, actor_user_id, event_type, request_id, payload)
  values (p_match_id, v_event_no, v_user_id, p_action_type, p_request_id, v_result);
  return v_result;
end;
$$;

drop policy if exists matches_permanent_gate on public.matches;
drop policy if exists match_players_permanent_gate on public.match_players;
drop policy if exists match_events_permanent_gate on public.match_events;
drop policy if exists business_empire_players_permanent_gate on public.business_empire_players;
drop policy if exists business_empire_owned_assets_permanent_gate on public.business_empire_owned_assets;

alter table public.match_players replica identity full;
alter table public.business_empire_players replica identity full;
alter table public.business_empire_owned_assets replica identity full;

do $$
begin
  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'match_players'
  ) then
    alter publication supabase_realtime add table public.match_players;
  end if;

  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_empire_players'
  ) then
    alter publication supabase_realtime add table public.business_empire_players;
  end if;

  if exists (
    select 1 from pg_catalog.pg_publication where pubname = 'supabase_realtime'
  ) and not exists (
    select 1 from pg_catalog.pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'business_empire_owned_assets'
  ) then
    alter publication supabase_realtime add table public.business_empire_owned_assets;
  end if;
end;
$$;

revoke all on function public.business_empire_action(uuid, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.business_empire_action(uuid, text, uuid, jsonb) to authenticated;

commit;
