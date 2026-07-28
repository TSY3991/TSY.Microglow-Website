begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(8);

select has_function(
  'public',
  'force_advance_expired_turn',
  array['uuid'],
  'turn timeout RPC exists'
);
select is_definer(
  'public',
  'force_advance_expired_turn',
  array['uuid'],
  'turn timeout RPC is security definer'
);
select ok(
  not has_function_privilege('anon', 'public.force_advance_expired_turn(uuid)', 'execute'),
  'plain anon role cannot execute turn timeout RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.force_advance_expired_turn(uuid)', 'execute'),
  'authenticated JWT can execute turn timeout RPC before claim validation'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('85000000-0000-4000-8000-000000000001', null, '{"display_name":"timeout host"}', true),
('85000000-0000-4000-8000-000000000002', null, '{"display_name":"timeout challenger"}', true);

create temp table timeout_state (key text primary key, value text);
grant all on timeout_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';

insert into timeout_state (key, value)
select 'room_id', r.id::text
from public.create_game_room(
  'microglow-business-empire', 'double-ring-city', 'public', 2::smallint,
  '85100000-0000-4000-8000-000000000001'
) r;
insert into timeout_state (key, value)
select 'room_code', room_code from public.game_rooms
where id = (select value::uuid from timeout_state where key = 'room_id');
select public.set_room_ready(
  (select value::uuid from timeout_state where key = 'room_id'), true,
  '{"character_key":"starlight-merchant"}'::jsonb
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select public.join_game_room((select value from timeout_state where key = 'room_code'));
select public.set_room_ready(
  (select value::uuid from timeout_state where key = 'room_id'), true,
  '{"character_key":"rune-artisan"}'::jsonb
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000001';
insert into timeout_state (key, value)
select 'match_id', m.id::text
from public.start_game_match(
  (select value::uuid from timeout_state where key = 'room_id'),
  '85100000-0000-4000-8000-000000000002'
) m;
reset role;

-- Challenger tries to force-advance before the deadline has passed.
set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select throws_ok(
  format('select public.force_advance_expired_turn(%L::uuid)',
    (select value from timeout_state where key = 'match_id')),
  'P0001',
  'Turn has not expired yet',
  'a seated player cannot force-advance before the deadline passes'
);
reset role;

-- Expire the deadline directly (simulating an AFK current player).
update public.matches set turn_deadline_at = now() - interval '1 minute'
where id = (select value::uuid from timeout_state where key = 'match_id');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"85000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '85000000-0000-4000-8000-000000000002';
select lives_ok(
  format('select public.force_advance_expired_turn(%L::uuid)',
    (select value from timeout_state where key = 'match_id')),
  'a non-current seated player can force-advance an expired turn'
);
reset role;

select is(
  (select current_player_id from public.matches
   where id = (select value::uuid from timeout_state where key = 'match_id')),
  '85000000-0000-4000-8000-000000000002'::uuid,
  'the expired turn was handed to the other seated player'
);
select is(
  (select count(*) from public.match_events
   where match_id = (select value::uuid from timeout_state where key = 'match_id')
     and event_type = 'turn_timeout'
     and actor_user_id = '85000000-0000-4000-8000-000000000001'),
  1::bigint,
  'a turn_timeout event records who was skipped'
);

select * from finish();
rollback;
