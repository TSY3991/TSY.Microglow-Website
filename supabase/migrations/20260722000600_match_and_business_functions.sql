begin;

create or replace function private.secure_d6()
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  v_byte integer;
begin
  loop
    v_byte := get_byte(extensions.gen_random_bytes(1), 0);
    exit when v_byte < 252;
  end loop;
  return (v_byte % 6) + 1;
end;
$$;

create or replace function private.business_empire_financials(p_match_id uuid, p_user_id uuid)
returns table (
  passive_income bigint,
  monthly_expense bigint,
  total_debt bigint,
  net_worth bigint,
  monthly_cashflow bigint,
  credit_available bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  with totals as (
    select
      coalesce(sum(c.monthly_income), 0)::bigint as passive_income,
      coalesce(sum(c.monthly_cost), 0)::bigint as asset_cost,
      coalesce(sum(c.loan_principal), 0)::bigint as asset_debt,
      coalesce(sum(c.asset_value), 0)::bigint as asset_value
    from public.business_empire_owned_assets o
    join public.business_empire_asset_catalog c on c.asset_key = o.asset_key
    where o.match_id = p_match_id and o.user_id = p_user_id
  )
  select
    t.passive_income,
    (p.base_expense + t.asset_cost + case when p.bank_debt > 0 then ceil(p.bank_debt::numeric / 18000)::bigint * 260 else 0 end)::bigint,
    (p.bank_debt + t.asset_debt)::bigint,
    (p.cash_balance + t.asset_value - p.bank_debt - t.asset_debt)::bigint,
    (p.salary + t.passive_income - p.base_expense - t.asset_cost - case when p.bank_debt > 0 then ceil(p.bank_debt::numeric / 18000)::bigint * 260 else 0 end)::bigint,
    greatest(0, p.salary * 10 - p.bank_debt)::bigint
  from public.business_empire_players p cross join totals t
  where p.match_id = p_match_id and p.user_id = p_user_id
$$;

create or replace function private.business_empire_score(p_match_id uuid, p_user_id uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select greatest(0, f.net_worth + f.passive_income * 18 + p.skill_level * 4000)::bigint
  from private.business_empire_financials(p_match_id, p_user_id) f
  join public.business_empire_players p on p.match_id = p_match_id and p.user_id = p_user_id
$$;

create or replace function public.start_game_match(p_room_id uuid, p_request_id uuid)
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
  v_first_user uuid;
begin
  select * into v_room from public.game_rooms where id = p_room_id for update;
  if not found or v_room.host_user_id <> v_user_id then raise exception 'Room host required'; end if;
  if v_room.status <> 'lobby' then
    if v_room.current_match_id is not null then
      select * into v_match from public.matches where id = v_room.current_match_id;
      return v_match;
    end if;
    raise exception 'Room is not in lobby state';
  end if;
  select min_players into v_min_players from public.game_maps where id = v_room.map_id;
  select count(*) into v_count from public.room_members
  where room_id = p_room_id and status in ('joined', 'ready');
  if v_count < v_min_players or v_count > v_room.max_players then raise exception 'Room player count is invalid'; end if;
  if exists (select 1 from public.room_members where room_id = p_room_id and status in ('joined', 'ready') and not is_ready) then
    raise exception 'All players must be ready';
  end if;
  select user_id into v_first_user from public.room_members
  where room_id = p_room_id and status = 'ready' order by seat_number limit 1;
  insert into public.matches (
    room_id, game_key, map_id, status, phase, current_player_id,
    turn_number, turn_started_at, turn_deadline_at, started_at,
    state
  ) values (
    p_room_id, v_room.game_key, v_room.map_id, 'active', 'roll', v_first_user,
    1, now(), now() + interval '45 seconds', now(),
    jsonb_build_object('start_request_id', p_request_id)
  ) returning * into v_match;
  insert into public.match_players (match_id, user_id, seat_number)
  select v_match.id, user_id, seat_number from public.room_members
  where room_id = p_room_id and status = 'ready';
  if v_room.game_key = 'microglow-business-empire' then
    for v_member in
      select rm.* from public.room_members rm where rm.room_id = p_room_id and rm.status = 'ready'
    loop
      select * into v_character from public.business_empire_characters
      where character_key = coalesce(v_member.loadout ->> 'character_key', 'starlight-merchant') and is_active;
      if not found then raise exception 'Invalid business empire character'; end if;
      insert into public.business_empire_players (
        match_id, user_id, character_key, cash_balance, salary, base_expense, skill_level
      ) values (
        v_match.id, v_member.user_id, v_character.character_key,
        v_character.starting_cash, v_character.salary, v_character.base_expense, v_character.starting_skill
      );
    end loop;
  end if;
  update public.game_rooms set status = 'in_progress', current_match_id = v_match.id where id = p_room_id;
  insert into public.match_events (match_id, event_no, event_type, request_id, payload)
  values (v_match.id, 1, 'match_started', p_request_id, jsonb_build_object('current_player_id', v_first_user));
  return v_match;
end;
$$;

create or replace function private.complete_business_match(p_match_id uuid, p_winner_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_game_key text;
  v_player record;
  v_score bigint;
begin
  select game_key into v_game_key from public.matches where id = p_match_id;
  update public.matches set status = 'completed', phase = 'completed', winner_user_id = p_winner_id,
    ended_at = now(), turn_deadline_at = null where id = p_match_id;
  update public.game_rooms r set status = 'completed', closed_at = now()
  from public.matches m where m.id = p_match_id and r.id = m.room_id;
  for v_player in select user_id from public.match_players where match_id = p_match_id loop
    v_score := private.business_empire_score(p_match_id, v_player.user_id);
    update public.match_players set status = 'finished', score = v_score,
      result = case when v_player.user_id = p_winner_id then 'win' else 'loss' end
    where match_id = p_match_id and user_id = v_player.user_id;
    insert into public.player_records (user_id, game_key, matches_played, wins, losses, best_score, last_played_at)
    values (v_player.user_id, v_game_key, 1,
      case when v_player.user_id = p_winner_id then 1 else 0 end,
      case when v_player.user_id = p_winner_id then 0 else 1 end,
      v_score, now())
    on conflict (user_id, game_key) do update set
      matches_played = public.player_records.matches_played + 1,
      wins = public.player_records.wins + case when excluded.user_id = p_winner_id then 1 else 0 end,
      losses = public.player_records.losses + case when excluded.user_id = p_winner_id then 0 else 1 end,
      best_score = greatest(coalesce(public.player_records.best_score, 0), excluded.best_score),
      last_played_at = now(), updated_at = now();
  end loop;
end;
$$;

create or replace function private.advance_business_turn(p_match_id uuid, p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player public.business_empire_players;
  v_fin record;
  v_next_user uuid;
  v_winner uuid;
  v_payload jsonb;
begin
  select * into v_player from public.business_empire_players
  where match_id = p_match_id and user_id = p_user_id for update;
  select * into v_fin from private.business_empire_financials(p_match_id, p_user_id);
  update public.business_empire_players set cash_balance = cash_balance + v_fin.monthly_cashflow,
    pending_action = null where match_id = p_match_id and user_id = p_user_id
  returning * into v_player;
  if v_player.cash_balance < 0 then
    if abs(v_player.cash_balance) <= v_fin.credit_available then
      update public.business_empire_players set bank_debt = bank_debt + abs(cash_balance), cash_balance = 0
      where match_id = p_match_id and user_id = p_user_id;
    else
      update public.business_empire_players set eliminated = true
      where match_id = p_match_id and user_id = p_user_id;
      update public.match_players set status = 'eliminated'
      where match_id = p_match_id and user_id = p_user_id;
    end if;
  end if;
  select mp.user_id into v_winner
  from public.match_players mp
  join public.business_empire_players bp on bp.match_id = mp.match_id and bp.user_id = mp.user_id
  cross join lateral private.business_empire_financials(mp.match_id, mp.user_id) f
  where mp.match_id = p_match_id and not bp.eliminated
    and f.passive_income > 0 and f.passive_income >= f.monthly_expense
  order by mp.seat_number limit 1;
  if v_winner is null and (select count(*) from public.business_empire_players where match_id = p_match_id and not eliminated) = 1 then
    select user_id into v_winner from public.business_empire_players where match_id = p_match_id and not eliminated;
  end if;
  if v_winner is not null then
    perform private.complete_business_match(p_match_id, v_winner);
    return jsonb_build_object('completed', true, 'winner_user_id', v_winner);
  end if;
  select mp.user_id into v_next_user
  from public.match_players mp
  join public.business_empire_players bp on bp.match_id = mp.match_id and bp.user_id = mp.user_id
  where mp.match_id = p_match_id and not bp.eliminated
    and mp.seat_number > (select seat_number from public.match_players where match_id = p_match_id and user_id = p_user_id)
  order by mp.seat_number limit 1;
  if v_next_user is null then
    select mp.user_id into v_next_user
    from public.match_players mp join public.business_empire_players bp on bp.match_id = mp.match_id and bp.user_id = mp.user_id
    where mp.match_id = p_match_id and not bp.eliminated order by mp.seat_number limit 1;
  end if;
  update public.matches set current_player_id = v_next_user, phase = 'roll', turn_number = turn_number + 1,
    turn_started_at = now(), turn_deadline_at = now() + interval '45 seconds'
  where id = p_match_id;
  v_payload := jsonb_build_object('completed', false, 'next_player_id', v_next_user, 'monthly_cashflow', v_fin.monthly_cashflow);
  return v_payload;
end;
$$;

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
  v_user_id uuid := private.require_user_id();
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

commit;
