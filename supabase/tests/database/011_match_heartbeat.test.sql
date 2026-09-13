begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select has_function('public', 'match_heartbeat', array['uuid'],
  'match_heartbeat RPC exists');
select is_definer('public', 'match_heartbeat', array['uuid'],
  'match_heartbeat is security definer');
select ok(not has_function_privilege('anon', 'public.match_heartbeat(uuid)', 'execute'),
  'anon role cannot execute match_heartbeat');
select ok(has_function_privilege('authenticated', 'public.match_heartbeat(uuid)', 'execute'),
  'authenticated can execute match_heartbeat');

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('92000000-0000-4000-8000-000000000001', null, '{"display_name":"hb host"}', true),
('92000000-0000-4000-8000-000000000002', null, '{"display_name":"hb guest"}', true),
('92000000-0000-4000-8000-000000000003', null, '{"display_name":"hb outsider"}', true);

create temp table hb_state (key text primary key, value text);
grant all on hb_state to authenticated;

-- Host creates a public room and readies.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
insert into hb_state (key, value)
select 'room_id', r.id::text
from public.create_game_room(
  'microglow-business-empire', 'double-ring-city', 'public', 2::smallint,
  '92100000-0000-4000-8000-000000000001'
) r;
insert into hb_state (key, value)
select 'room_code', room_code from public.game_rooms
where id = (select value::uuid from hb_state where key = 'room_id');
select public.set_room_ready(
  (select value::uuid from hb_state where key = 'room_id'), true,
  '{"character_key":"starlight-merchant"}'::jsonb);
reset role;

-- Guest joins + readies.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000002';
select public.join_game_room((select value from hb_state where key = 'room_code'));
select public.set_room_ready(
  (select value::uuid from hb_state where key = 'room_id'), true,
  '{"character_key":"rune-artisan"}'::jsonb);
reset role;

-- Host starts the match.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
insert into hb_state (key, value)
select 'match_id', m.id::text
from public.start_game_match(
  (select value::uuid from hb_state where key = 'room_id'),
  '92100000-0000-4000-8000-000000000002'
) m;
reset role;

-- Pre-set host's last_seen_at to a stale value so we can verify the update.
update public.match_players
set last_seen_at = now() - interval '5 minutes',
    is_connected = false,
    disconnected_at = now() - interval '5 minutes'
where match_id = (select value::uuid from hb_state where key = 'match_id')
  and user_id = '92000000-0000-4000-8000-000000000001';

-- Host heartbeats — should refresh their own row and return everyone's presence.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
select lives_ok(
  format('select public.match_heartbeat(%L::uuid)',
    (select value from hb_state where key = 'match_id')),
  'active member heartbeat succeeds');
reset role;

select ok(
  (select last_seen_at > now() - interval '10 seconds' and is_connected and disconnected_at is null
   from public.match_players
   where match_id = (select value::uuid from hb_state where key = 'match_id')
     and user_id = '92000000-0000-4000-8000-000000000001'),
  'host row refreshed: last_seen_at bumped, is_connected true, disconnected_at cleared');

-- Response payload should list every seat.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000001';
select is(
  jsonb_array_length(
    (public.match_heartbeat((select value::uuid from hb_state where key = 'match_id'))->'players')),
  2,
  'heartbeat response returns both seats');
reset role;

-- Non-member (never joined) cannot heartbeat this match.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '92000000-0000-4000-8000-000000000003';
select throws_ok(
  format('select public.match_heartbeat(%L::uuid)',
    (select value from hb_state where key = 'match_id')),
  '42501', 'Active match membership required',
  'non-member cannot heartbeat a match they are not in');
reset role;

select * from finish();
rollback;
