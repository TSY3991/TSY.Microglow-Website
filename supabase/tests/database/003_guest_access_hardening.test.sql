begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(34);

select has_table('public', 'guest_play_sessions', 'guest sessions table exists');
select has_table('public', 'guest_play_events', 'guest events table exists');
select has_table('public', 'guest_play_results', 'guest results table exists');
select has_function('private', 'require_permanent_user', array[]::text[], 'permanent user guard exists');
select has_function('public', 'start_guest_play_session', array['text','uuid','integer'], 'guest session RPC exists');
select ok(
  (select bool_and(c.relrowsecurity)
   from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and c.relname in ('guest_play_sessions','guest_play_events','guest_play_results')),
  'all guest tables have RLS enabled'
);
select ok(
  to_regprocedure('public.rls_auto_enable()') is null
  or not has_function_privilege('anon', 'public.rls_auto_enable()', 'execute'),
  'anon cannot execute rls_auto_enable when present'
);
select ok(
  to_regprocedure('public.rls_auto_enable()') is null
  or not has_function_privilege('authenticated', 'public.rls_auto_enable()', 'execute'),
  'authenticated cannot execute rls_auto_enable when present'
);
select is(
  (select count(distinct tablename)
   from pg_policies
   where schemaname = 'public'
     and permissive = 'RESTRICTIVE'
     and policyname like '%_permanent_gate'),
  18::bigint,
  'all member-only public tables have restrictive permanent-user gates'
);
select ok(
  not has_function_privilege('anon', 'public.start_guest_play_session(text,uuid,integer)', 'execute'),
  'plain anon role cannot execute guest session RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.start_guest_play_session(text,uuid,integer)', 'execute'),
  'authenticated JWT can reach guest session RPC before claim validation'
);
select is(
  (select count(*)
   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'send_friend_invite','respond_friend_invite','create_game_room','join_game_room',
       'set_room_ready','invite_friend_to_room','enqueue_match','set_match_connection',
       'start_game_match','business_empire_action','create_radar_product',
       'record_radar_price','upsert_radar_watchlist'
     )
     and pg_get_functiondef(p.oid) like '%private.require_user_id()%'),
  13::bigint,
  'all existing public member/admin RPCs use the hardened shared guard'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('81000000-0000-4000-8000-000000000001', 'member1@example.test', '{}', false),
('81000000-0000-4000-8000-000000000002', 'member2@example.test', '{}', false),
('81000000-0000-4000-8000-000000000003', null, '{"display_name":"訪客測試"}', true);

select is(
  (select is_public from public.profiles where id = '81000000-0000-4000-8000-000000000003'),
  false,
  'new anonymous profile is private by default'
);

insert into public.friend_invites (sender_id, receiver_id, request_id)
values (
  '81000000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000001',
  '81100000-0000-4000-8000-000000000001'
);
insert into public.game_rooms (
  room_code, game_key, map_id, host_user_id, visibility, max_players, request_id
) values (
  'GUEST2',
  'microglow-business-empire',
  '39910000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001',
  'public',
  2,
  '81100000-0000-4000-8000-000000000002'
);
insert into public.player_records (user_id, game_key, matches_played, wins)
values ('81000000-0000-4000-8000-000000000001', 'microglow-business-empire', 1, 1);

create temp table guest_test_state (key text primary key, value text, payload jsonb);
grant all on guest_test_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';

select throws_ok(
  $$select public.send_friend_invite('81000000-0000-4000-8000-000000000002','81200000-0000-4000-8000-000000000001')$$,
  '42501',
  'Permanent account required',
  'anonymous JWT cannot send friend invites'
);
select throws_ok(
  $$select public.create_game_room('microglow-business-empire','double-ring-city','private',2::smallint,'81200000-0000-4000-8000-000000000002')$$,
  '42501',
  'Permanent account required',
  'anonymous JWT cannot create formal game rooms'
);
select throws_ok(
  $$select public.enqueue_match('microglow-business-empire','double-ring-city','81200000-0000-4000-8000-000000000003')$$,
  '42501',
  'Permanent account required',
  'anonymous JWT cannot enter formal matchmaking'
);
select throws_ok(
  $$select public.upsert_radar_watchlist('39910000-0000-4000-8000-000000000001',99)$$,
  '42501',
  'Permanent account required',
  'anonymous JWT cannot use member radar watchlists'
);
select results_eq(
  $$select id from public.profiles order by id$$,
  array['81000000-0000-4000-8000-000000000003'::uuid],
  'anonymous JWT can only read its own profile'
);
select results_eq(
  $$select count(*) from public.friend_invites$$,
  array[0::bigint],
  'anonymous JWT cannot read friend invites even as a participant'
);
select results_eq(
  $$select count(*) from public.game_rooms$$,
  array[0::bigint],
  'anonymous JWT cannot read public formal rooms'
);
select results_eq(
  $$select count(*) from public.player_records$$,
  array[0::bigint],
  'anonymous JWT cannot read formal ranking records'
);
select is(
  (select count(*) from public.game_definitions where game_key = 'microglow-business-empire'),
  1::bigint,
  'anonymous JWT can still read active game reference data'
);
select throws_ok(
  $$insert into public.guest_play_sessions(user_id,game_key,request_id,expires_at) values ('81000000-0000-4000-8000-000000000003','microglow-business-empire','81200000-0000-4000-8000-000000000004',now()+interval '1 hour')$$,
  '42501',
  null,
  'guest tables reject direct browser inserts'
);

insert into guest_test_state(key, value)
select 'session', (public.start_guest_play_session(
  'microglow-business-empire',
  '81300000-0000-4000-8000-000000000001',
  120
)).id::text;
select ok(
  (select value::uuid is not null from guest_test_state where key = 'session'),
  'anonymous JWT can start an isolated guest session'
);
select is(
  (public.start_guest_play_session(
    'microglow-business-empire',
    '81300000-0000-4000-8000-000000000001',
    120
  )).id::text,
  (select value from guest_test_state where key = 'session'),
  'guest session creation is idempotent'
);
insert into guest_test_state(key, value, payload)
select 'event', e.id::text, e.payload
from public.append_guest_play_event(
  (select value::uuid from guest_test_state where key = 'session'),
  'roll_intent',
  '81300000-0000-4000-8000-000000000002',
  '{"requested":true,"dice":99}'
) e;
select is(
  (select payload->>'dice' from guest_test_state where key = 'event'),
  '99',
  'guest event stores client input only as non-authoritative intent telemetry'
);
insert into guest_test_state(key, value, payload)
select 'result', r.session_id::text, r.summary
from public.complete_guest_play_session(
  (select value::uuid from guest_test_state where key = 'session'),
  '81300000-0000-4000-8000-000000000003'
) r;
select is(
  (select payload->>'record_type' from guest_test_state where key = 'result'),
  'non_authoritative_trial',
  'guest completion produces only a non-authoritative trial result'
);
reset role;

select is(
  (select count(*) from public.player_records where user_id = '81000000-0000-4000-8000-000000000003'),
  0::bigint,
  'guest completion never writes formal player_records'
);
select is(
  (select event_count from public.guest_play_results
   where session_id = (select value::uuid from guest_test_state where key = 'session')),
  1,
  'guest result count is derived by the server'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '81000000-0000-4000-8000-000000000003';
select is(
  (select count(*) from public.guest_play_results),
  1::bigint,
  'same UID can read its guest result after manual account linking'
);
select throws_ok(
  $$select public.start_guest_play_session('microglow-business-empire','81300000-0000-4000-8000-000000000004',120)$$,
  '42501',
  'Anonymous account required',
  'permanent JWT cannot create new guest-only sessions'
);
reset role;

insert into public.guest_play_sessions (
  id, user_id, game_key, status, request_id, started_at, last_activity_at, expires_at
) values (
  '81400000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000003',
  'microglow-business-empire',
  'active',
  '81400000-0000-4000-8000-000000000002',
  now() - interval '3 days',
  now() - interval '3 days',
  now() - interval '2 days'
);
insert into public.guest_play_sessions (
  id, user_id, game_key, status, request_id, started_at, last_activity_at, expires_at, completed_at
) values (
  '81400000-0000-4000-8000-000000000003',
  '81000000-0000-4000-8000-000000000002',
  'microglow-business-empire',
  'expired',
  '81400000-0000-4000-8000-000000000004',
  now() - interval '42 days',
  now() - interval '41 days',
  now() - interval '41 days',
  now() - interval '40 days'
);
select * from private.expire_guest_play_sessions(now(), interval '30 days');
select is(
  (select status::text from public.guest_play_sessions where id = '81400000-0000-4000-8000-000000000001'),
  'expired',
  'cleanup marks expired active guest sessions'
);
select is(
  (select count(*) from public.guest_play_sessions where id = '81400000-0000-4000-8000-000000000003'),
  0::bigint,
  'cleanup purges guest sessions beyond retention'
);
select is(
  (select count(*) from cron.job where jobname = 'microglow-expire-guest-sessions'),
  1::bigint,
  'guest session cleanup cron is scheduled exactly once'
);

select * from finish();
rollback;
