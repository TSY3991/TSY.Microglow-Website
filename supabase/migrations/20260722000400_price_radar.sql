begin;

create table public.radar_sources (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  name text not null,
  kind public.radar_source_kind not null,
  base_url text,
  status public.radar_source_status not null default 'active',
  status_message text,
  last_checked_at timestamptz,
  last_success_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index radar_sources_status_idx on public.radar_sources (status, name);

create table public.radar_products (
  id uuid primary key default gen_random_uuid(),
  barcode text,
  name text not null,
  brand text,
  specification text,
  unit_amount numeric(12,3),
  unit_type text check (unit_type is null or unit_type in ('g', 'mL')),
  pack_count integer check (pack_count is null or pack_count > 0),
  image_path text,
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_products_unit_pair check ((unit_amount is null) = (unit_type is null))
);
create unique index radar_products_barcode_unique_idx on public.radar_products (barcode) where barcode is not null;
create index radar_products_name_idx on public.radar_products using gin (to_tsvector('simple', name));

create table public.radar_source_products (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references public.radar_sources(id) on delete cascade,
  product_id uuid not null references public.radar_products(id) on delete cascade,
  external_product_id text,
  product_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_source_products_pair_unique unique (source_id, product_id)
);
create unique index radar_source_products_external_unique_idx
  on public.radar_source_products (source_id, external_product_id)
  where external_product_id is not null;
create index radar_source_products_product_idx on public.radar_source_products (product_id, source_id);

create table public.radar_prices (
  id bigint generated always as identity primary key,
  source_product_id uuid not null references public.radar_source_products(id) on delete cascade,
  price numeric(12,2) not null check (price >= 0),
  original_price numeric(12,2) check (original_price is null or original_price >= price),
  currency text not null default 'TWD' check (currency ~ '^[A-Z]{3}$'),
  price_kind public.radar_price_kind not null default 'regular',
  promo_start date,
  promo_end date,
  observed_at timestamptz not null,
  reported_by uuid references auth.users(id) on delete set null,
  request_id uuid,
  ingestion_key text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint radar_prices_promo_range check (promo_end is null or promo_start is null or promo_end >= promo_start)
);
create unique index radar_prices_dedupe_idx on public.radar_prices
  (source_product_id, observed_at, price, coalesce(original_price, -1), currency);
create unique index radar_prices_ingestion_unique_idx on public.radar_prices (source_product_id, ingestion_key)
  where ingestion_key is not null;
create unique index radar_prices_request_unique_idx on public.radar_prices (reported_by, request_id)
  where reported_by is not null and request_id is not null;
create index radar_prices_product_time_idx on public.radar_prices (source_product_id, observed_at desc);

create table public.radar_watchlists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.radar_products(id) on delete cascade,
  target_price numeric(12,2) check (target_price is null or target_price >= 0),
  last_seen_price numeric(12,2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint radar_watchlists_user_product_unique unique (user_id, product_id)
);
create index radar_watchlists_user_active_idx on public.radar_watchlists (user_id, updated_at desc)
  where is_active = true;

create table public.radar_alerts (
  id uuid primary key default gen_random_uuid(),
  watchlist_id uuid not null references public.radar_watchlists(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  price_id bigint not null references public.radar_prices(id) on delete cascade,
  status public.radar_alert_status not null default 'pending',
  target_price numeric(12,2),
  triggered_price numeric(12,2) not null,
  read_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint radar_alerts_once unique (watchlist_id, price_id)
);
create index radar_alerts_user_status_idx on public.radar_alerts (user_id, status, created_at desc);

commit;
