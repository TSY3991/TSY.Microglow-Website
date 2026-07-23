begin;

create table public.business_empire_characters (
  character_key text primary key,
  name text not null,
  starting_cash bigint not null check (starting_cash >= 0),
  salary bigint not null check (salary >= 0),
  base_expense bigint not null check (base_expense >= 0),
  starting_skill integer not null default 0 check (starting_skill >= 0),
  is_active boolean not null default true
);

create table public.business_empire_asset_catalog (
  asset_key text primary key,
  zone text not null check (zone in ('basic', 'elite')),
  asset_type text not null check (asset_type in ('stock', 'real_estate', 'business')),
  name text not null,
  purchase_price bigint not null check (purchase_price > 0),
  asset_value bigint not null check (asset_value >= 0),
  loan_principal bigint not null default 0 check (loan_principal >= 0),
  monthly_income bigint not null default 0,
  monthly_cost bigint not null default 0 check (monthly_cost >= 0),
  risk_level text not null check (risk_level in ('low', 'medium', 'high')),
  is_active boolean not null default true
);
create index business_empire_assets_offer_idx on public.business_empire_asset_catalog (zone, asset_type)
  where is_active = true;

create table public.business_empire_players (
  match_id uuid not null,
  user_id uuid not null,
  character_key text not null references public.business_empire_characters(character_key) on delete restrict,
  board_zone text not null default 'basic' check (board_zone in ('basic', 'elite')),
  board_position integer not null default 0 check (board_position >= 0),
  cash_balance bigint not null,
  salary bigint not null check (salary >= 0),
  base_expense bigint not null check (base_expense >= 0),
  bank_debt bigint not null default 0 check (bank_debt >= 0),
  skill_level integer not null default 0 check (skill_level >= 0),
  pending_action jsonb,
  eliminated boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (match_id, user_id),
  foreign key (match_id, user_id) references public.match_players(match_id, user_id) on delete cascade
);

create table public.business_empire_owned_assets (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null,
  user_id uuid not null,
  asset_key text not null references public.business_empire_asset_catalog(asset_key) on delete restrict,
  paid_price bigint not null check (paid_price >= 0),
  board_zone text not null check (board_zone in ('basic', 'elite')),
  board_position integer not null check (board_position >= 0),
  acquired_at timestamptz not null default now(),
  foreign key (match_id, user_id) references public.business_empire_players(match_id, user_id) on delete cascade
);
create index business_empire_owned_player_idx on public.business_empire_owned_assets (match_id, user_id);

commit;
