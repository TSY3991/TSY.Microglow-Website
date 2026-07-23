begin;

create or replace function public.create_radar_product(
  p_barcode text,
  p_name text,
  p_brand text,
  p_specification text,
  p_unit_amount numeric,
  p_unit_type text,
  p_pack_count integer,
  p_request_id uuid
)
returns public.radar_products
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_product public.radar_products;
  v_saved jsonb;
begin
  select response into v_saved from private.idempotency_keys
  where user_id = v_user_id and scope = 'radar_product' and request_id = p_request_id;
  if found then
    select * into v_product from public.radar_products where id = (v_saved ->> 'product_id')::uuid;
    return v_product;
  end if;
  if nullif(trim(p_name), '') is null then raise exception 'Product name is required'; end if;
  if (p_unit_amount is null) <> (p_unit_type is null) then raise exception 'Unit amount and unit type must be provided together'; end if;
  if p_unit_type is not null and p_unit_type not in ('g', 'mL') then raise exception 'Unsupported unit type'; end if;
  insert into public.radar_products (barcode, name, brand, specification, unit_amount, unit_type, pack_count, created_by)
  values (nullif(trim(p_barcode), ''), trim(p_name), nullif(trim(p_brand), ''), nullif(trim(p_specification), ''),
    p_unit_amount, p_unit_type, p_pack_count, v_user_id)
  returning * into v_product;
  insert into private.idempotency_keys (user_id, scope, request_id, response)
  values (v_user_id, 'radar_product', p_request_id, jsonb_build_object('product_id', v_product.id));
  return v_product;
exception when unique_violation then
  if nullif(trim(p_barcode), '') is not null then
    select * into v_product from public.radar_products where barcode = trim(p_barcode);
    if found then return v_product; end if;
  end if;
  raise;
end;
$$;

create or replace function private.create_radar_alerts()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.radar_alerts (watchlist_id, user_id, price_id, target_price, triggered_price)
  select w.id, w.user_id, new.id, w.target_price, new.price
  from public.radar_watchlists w
  join public.radar_source_products sp on sp.product_id = w.product_id
  where sp.id = new.source_product_id
    and w.is_active
    and w.target_price is not null
    and new.price <= w.target_price
  on conflict (watchlist_id, price_id) do nothing;
  return new;
end;
$$;

create trigger radar_prices_create_alerts
after insert on public.radar_prices
for each row execute function private.create_radar_alerts();

create or replace function public.record_radar_price(
  p_source_id uuid,
  p_product_id uuid,
  p_price numeric,
  p_original_price numeric,
  p_price_kind public.radar_price_kind,
  p_observed_at timestamptz,
  p_request_id uuid,
  p_external_product_id text default null,
  p_product_url text default null,
  p_ingestion_key text default null,
  p_promo_start date default null,
  p_promo_end date default null
)
returns public.radar_prices
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_source_product_id uuid;
  v_price public.radar_prices;
begin
  select * into v_price from public.radar_prices where reported_by = v_user_id and request_id = p_request_id;
  if found then return v_price; end if;
  if p_price < 0 or (p_original_price is not null and p_original_price < p_price) then raise exception 'Invalid price'; end if;
  if p_observed_at > now() + interval '5 minutes' or p_observed_at < now() - interval '2 years' then
    raise exception 'Observed time is outside the accepted range';
  end if;
  if p_promo_end is not null and p_promo_start is not null and p_promo_end < p_promo_start then
    raise exception 'Invalid promotion date range';
  end if;
  if not exists (select 1 from public.radar_sources where id = p_source_id and status in ('active', 'degraded')) then
    raise exception 'Price source is not active';
  end if;
  if not exists (select 1 from public.radar_products where id = p_product_id and is_active) then
    raise exception 'Product is not active';
  end if;
  insert into public.radar_source_products (source_id, product_id, external_product_id, product_url)
  values (p_source_id, p_product_id, nullif(trim(p_external_product_id), ''), nullif(trim(p_product_url), ''))
  on conflict (source_id, product_id) do update set
    external_product_id = coalesce(excluded.external_product_id, public.radar_source_products.external_product_id),
    product_url = coalesce(excluded.product_url, public.radar_source_products.product_url),
    updated_at = now()
  returning id into v_source_product_id;
  insert into public.radar_prices (
    source_product_id, price, original_price, price_kind, promo_start, promo_end,
    observed_at, reported_by, request_id, ingestion_key
  ) values (
    v_source_product_id, p_price, p_original_price, p_price_kind, p_promo_start, p_promo_end,
    p_observed_at, v_user_id, p_request_id, nullif(trim(p_ingestion_key), '')
  ) on conflict do nothing returning * into v_price;
  if not found then
    select * into v_price from public.radar_prices
    where source_product_id = v_source_product_id and observed_at = p_observed_at
      and price = p_price and coalesce(original_price, -1) = coalesce(p_original_price, -1)
      and currency = 'TWD' order by id limit 1;
  end if;
  return v_price;
end;
$$;

create or replace function public.upsert_radar_watchlist(p_product_id uuid, p_target_price numeric)
returns public.radar_watchlists
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := private.require_user_id();
  v_watch public.radar_watchlists;
  v_latest numeric;
begin
  if p_target_price is not null and p_target_price < 0 then raise exception 'Target price cannot be negative'; end if;
  select rp.price into v_latest
  from public.radar_prices rp join public.radar_source_products sp on sp.id = rp.source_product_id
  where sp.product_id = p_product_id order by rp.observed_at desc limit 1;
  insert into public.radar_watchlists (user_id, product_id, target_price, last_seen_price)
  values (v_user_id, p_product_id, p_target_price, v_latest)
  on conflict (user_id, product_id) do update set target_price = excluded.target_price,
    is_active = true, updated_at = now()
  returning * into v_watch;
  return v_watch;
end;
$$;

create or replace function private.run_matchmaking_once()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_seed public.match_queue;
  v_map public.game_maps;
  v_ids uuid[];
  v_users uuid[];
  v_room_id uuid;
  v_code text;
  v_count integer;
begin
  update public.match_queue set status = 'expired' where status = 'waiting' and expires_at <= now();
  select * into v_seed from public.match_queue
  where status = 'waiting' and expires_at > now() order by queued_at for update skip locked limit 1;
  if not found then return 0; end if;
  select * into v_map from public.game_maps where id = v_seed.map_id and is_active;
  select array_agg(id order by queued_at), array_agg(user_id order by queued_at)
  into v_ids, v_users
  from (
    select id, user_id, queued_at from public.match_queue
    where status = 'waiting' and game_key = v_seed.game_key and map_id = v_seed.map_id and expires_at > now()
    order by queued_at for update skip locked limit v_map.max_players
  ) q;
  v_count := coalesce(array_length(v_ids, 1), 0);
  if v_count < v_map.min_players then return 0; end if;
  for i in 1..10 loop
    v_code := private.random_room_code();
    begin
      insert into public.game_rooms (room_code, game_key, map_id, host_user_id, visibility, status, max_players, request_id)
      values (v_code, v_seed.game_key, v_seed.map_id, v_users[1], 'private', 'lobby', v_count,
        gen_random_uuid())
      returning id into v_room_id;
      exit;
    exception when unique_violation then null;
    end;
  end loop;
  if v_room_id is null then raise exception 'Unable to create matched room'; end if;
  for i in 1..v_count loop
    insert into public.room_members (room_id, user_id, seat_number, status, is_ready)
    values (v_room_id, v_users[i], i, 'ready', true);
  end loop;
  update public.match_queue set status = 'matched', matched_room_id = v_room_id, matched_at = now()
  where id = any(v_ids);
  return v_count;
end;
$$;

create or replace function private.expire_stale_game_state()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.match_queue set status = 'expired' where status = 'waiting' and expires_at <= now();
  update public.room_invites set status = 'expired' where status = 'pending' and expires_at <= now();
  update public.friend_invites set status = 'expired' where status = 'pending' and expires_at <= now();
  update public.room_members set status = 'disconnected', disconnected_at = coalesce(disconnected_at, now())
  where status in ('joined', 'ready') and last_seen_at < now() - interval '2 minutes';
end;
$$;

commit;
