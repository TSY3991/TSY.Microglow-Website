begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(10);

select has_function('public', 'abandon_room_membership', array['uuid','uuid'],
  'abandon room membership RPC exists');
select is_definer('public', 'abandon_room_membership', array['uuid','uuid'],
  'abandon room membership RPC is security definer');
select ok(not has_function_privilege('anon', 'public.abandon_room_membership(uuid,uuid)', 'execute'),
  'plain anon role cannot execute abandon_room_membership');
select ok(has_function_privilege('authenticated', 'public.abandon_room_membership(uuid,uuid)', 'execute'),
  'authenticated JWT can execute abandon_room_membership before claim validation');

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('87000000-0000-4000-8000-000000000001', null, '{"display_name":"abandon host"}', true),
('87000000-0000-4000-8000-000000000002', null, '{"display_name":"abandon guest"}', true);

create temp table abandon_state (key text primary key, value text);
grant all on abandon_state to authenticated;

-- Host creates a public room and readies up.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
insert into abandon_state (key, value)
select 'room_id', r.id::text
from public.create_game_room(
  'microglow-business-empire', 'double-ring-city', 'public', 2::smallint,
  '87100000-0000-4000-8000-000000000001'
) r;
insert into abandon_state (key, value)
select 'room_code', room_code from public.game_rooms
where id = (select value::uuid from abandon_state where key = 'room_id');
select public.set_room_ready(
  (select value::uuid from abandon_state where key = 'room_id'), true,
  '{"character_key":"starlight-merchant"}'::jsonb);
reset role;

-- A stranger who never joined the room cannot abandon it.
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('87000000-0000-4000-8000-000000000003', null, '{"display_name":"outsider"}', true);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000003';
select throws_ok(
  format('select public.abandon_room_membership(%L::uuid, %L::uuid)',
    (select value from abandon_state where key = 'room_id'),
    '87200000-0000-4000-8000-000000000010'),
  '42501', 'Active room membership required',
  'a non-member cannot abandon someone else''s room');
reset role;

-- Guest joins and readies.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000002';
select public.join_game_room((select value from abandon_state where key = 'room_code'));
select public.set_room_ready(
  (select value::uuid from abandon_state where key = 'room_id'), true,
  '{"character_key":"rune-artisan"}'::jsonb);
reset role;

-- Host starts the match, making the room in_progress.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000001';
insert into abandon_state (key, value)
select 'match_id', m.id::text
from public.start_game_match(
  (select value::uuid from abandon_state where key = 'room_id'),
  '87100000-0000-4000-8000-000000000002'
) m;
reset role;

-- Guest abandons the in-progress room; leave_game_room would have refused this.
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"87000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '87000000-0000-4000-8000-000000000002';
select throws_ok(
  format('select public.leave_game_room(%L::uuid, %L::uuid)',
    (select value from abandon_state where key = 'room_id'),
    '87200000-0000-4000-8000-000000000020'),
  '55000', 'Only lobby rooms can be left',
  'leave_game_room still refuses in-progress rooms (regression guard)');
select lives_ok(
  format('select public.abandon_room_membership(%L::uuid, %L::uuid)',
    (select value from abandon_state where key = 'room_id'),
    '87200000-0000-4000-8000-000000000021'),
  'a member can abandon an in-progress room');
-- Idempotency guard: same request_id returns the cached response without erroring.
select lives_ok(
  format('select public.abandon_room_membership(%L::uuid, %L::uuid)',
    (select value from abandon_state where key = 'room_id'),
    '87200000-0000-4000-8000-000000000021'),
  'replaying the same request_id is idempotent');
reset role;

-- Verify the post-conditions as the test superuser (RLS filters "left" rows
-- from the abandoning JWT because is_room_member() only accepts joined/ready/
-- disconnected — that behaviour is intentional, so we probe outside the JWT).
select is(
  (select status::text from public.room_members
   where room_id = (select value::uuid from abandon_state where key = 'room_id')
     and user_id = '87000000-0000-4000-8000-000000000002'),
  'left',
  'the abandoning member row is marked left');
select is(
  (select status::text from public.match_players
   where match_id = (select value::uuid from abandon_state where key = 'match_id')
     and user_id = '87000000-0000-4000-8000-000000000002'),
  'left',
  'the corresponding match_players row is also marked left');

select * from finish();
rollback;
