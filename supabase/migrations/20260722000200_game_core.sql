begin;

create table public.game_definitions (
  game_key text primary key,
  title text not null,
  min_players smallint not null default 2 check (min_players between 1 and 4),
  max_players smallint not null default 4 check (max_players between 1 and 4),
  turn_seconds integer not null default 45 check (turn_seconds between 5 and 600),
  is_active boolean not null default true,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_definitions_player_range check (min_players <= max_players)
);

create table public.game_maps (
  id uuid primary key default gen_random_uuid(),
  game_key text not null references public.game_definitions(game_key) on delete cascade,
  map_key text not null,
  title text not null,
  min_players smallint not null default 2 check (min_players between 1 and 4),
  max_players smallint not null default 4 check (max_players between 1 and 4),
  config jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint game_maps_player_range check (min_players <= max_players),
  constraint game_maps_key_unique unique (game_key, map_key),
  constraint game_maps_game_id_unique unique (game_key, id)
);

create table public.game_map_tiles (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references public.game_maps(id) on delete cascade,
  zone text not null default 'main',
  position integer not null check (position >= 0),
  tile_type text not null,
  label text not null,
  config jsonb not null default '{}'::jsonb,
  constraint game_map_tiles_position_unique unique (map_id, zone, position)
);
create index game_map_tiles_lookup_idx on public.game_map_tiles (map_id, zone, position);

create table public.game_rooms (
  id uuid primary key default gen_random_uuid(),
  room_code text not null unique,
  game_key text not null,
  map_id uuid not null,
  host_user_id uuid not null references auth.users(id) on delete restrict,
  visibility public.room_visibility not null default 'private',
  status public.room_status not null default 'lobby',
  max_players smallint not null default 4 check (max_players between 1 and 4),
  current_match_id uuid,
  request_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  closed_at timestamptz,
  constraint game_rooms_code_format check (room_code ~ '^[A-Z2-9]{6}$'),
  constraint game_rooms_request_unique unique (host_user_id, request_id),
  constraint game_rooms_map_fk foreign key (game_key, map_id)
    references public.game_maps(game_key, id) on delete restrict
);
create index game_rooms_status_created_idx on public.game_rooms (status, created_at desc);
create index game_rooms_host_status_idx on public.game_rooms (host_user_id, status, created_at desc);

create table public.room_members (
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 4),
  status public.room_member_status not null default 'joined',
  is_ready boolean not null default false,
  loadout jsonb not null default '{}'::jsonb,
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  left_at timestamptz,
  primary key (room_id, user_id),
  constraint room_members_seat_unique unique (room_id, seat_number)
);
create index room_members_user_status_idx on public.room_members (user_id, status, last_seen_at desc);

create table public.room_invites (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  receiver_id uuid not null references auth.users(id) on delete cascade,
  status public.friend_invite_status not null default 'pending',
  request_id uuid not null,
  expires_at timestamptz not null default (now() + interval '30 minutes'),
  responded_at timestamptz,
  created_at timestamptz not null default now(),
  constraint room_invites_not_self check (sender_id <> receiver_id),
  constraint room_invites_request_unique unique (sender_id, request_id)
);
create unique index room_invites_pending_unique_idx on public.room_invites (room_id, receiver_id)
  where status = 'pending';
create index room_invites_receiver_status_idx on public.room_invites (receiver_id, status, created_at desc);

create table public.match_queue (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null references public.game_definitions(game_key) on delete cascade,
  map_id uuid not null references public.game_maps(id) on delete cascade,
  status public.queue_status not null default 'waiting',
  request_id uuid not null,
  matched_room_id uuid references public.game_rooms(id) on delete set null,
  queued_at timestamptz not null default now(),
  matched_at timestamptz,
  expires_at timestamptz not null default (now() + interval '10 minutes'),
  constraint match_queue_request_unique unique (user_id, request_id)
);
create unique index match_queue_one_waiting_user_idx on public.match_queue (user_id) where status = 'waiting';
create index match_queue_matchmaking_idx on public.match_queue (game_key, map_id, queued_at)
  where status = 'waiting';

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.game_rooms(id) on delete cascade,
  game_key text not null references public.game_definitions(game_key) on delete restrict,
  map_id uuid not null references public.game_maps(id) on delete restrict,
  status public.match_status not null default 'pending',
  phase text not null default 'waiting',
  current_player_id uuid references auth.users(id) on delete set null,
  turn_number integer not null default 0 check (turn_number >= 0),
  turn_started_at timestamptz,
  turn_deadline_at timestamptz,
  winner_user_id uuid references auth.users(id) on delete set null,
  state jsonb not null default '{}'::jsonb,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.game_rooms
  add constraint game_rooms_current_match_fk foreign key (current_match_id)
  references public.matches(id) on delete set null;
create index matches_room_created_idx on public.matches (room_id, created_at desc);
create index matches_active_deadline_idx on public.matches (turn_deadline_at) where status = 'active';

create table public.match_players (
  match_id uuid not null references public.matches(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  seat_number smallint not null check (seat_number between 1 and 4),
  status public.match_player_status not null default 'active',
  is_connected boolean not null default true,
  last_seen_at timestamptz not null default now(),
  disconnected_at timestamptz,
  final_rank smallint check (final_rank between 1 and 4),
  score bigint,
  result text,
  state jsonb not null default '{}'::jsonb,
  primary key (match_id, user_id),
  constraint match_players_seat_unique unique (match_id, seat_number)
);
create index match_players_user_time_idx on public.match_players (user_id, last_seen_at desc);

create table public.match_events (
  id bigint generated always as identity primary key,
  match_id uuid not null references public.matches(id) on delete cascade,
  event_no bigint not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  request_id uuid,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint match_events_number_unique unique (match_id, event_no)
);
create unique index match_events_request_unique_idx
  on public.match_events (match_id, actor_user_id, request_id)
  where request_id is not null and actor_user_id is not null;
create index match_events_match_time_idx on public.match_events (match_id, event_no);

create table public.player_records (
  user_id uuid not null references auth.users(id) on delete cascade,
  game_key text not null references public.game_definitions(game_key) on delete cascade,
  matches_played integer not null default 0 check (matches_played >= 0),
  wins integer not null default 0 check (wins >= 0),
  losses integer not null default 0 check (losses >= 0),
  draws integer not null default 0 check (draws >= 0),
  best_score bigint,
  rating integer not null default 1000,
  last_played_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, game_key)
);
create index player_records_game_rating_idx on public.player_records (game_key, rating desc);

commit;
