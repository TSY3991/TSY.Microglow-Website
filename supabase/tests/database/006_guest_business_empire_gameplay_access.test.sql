begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select has_function(
  'public',
  'business_empire_action',
  array['uuid','text','uuid','jsonb'],
  'business empire gameplay action RPC exists'
);
select is_definer(
  'public',
  'business_empire_action',
  array['uuid','text','uuid','jsonb'],
  'business empire gameplay action is security definer'
);
select ok(
  not has_function_privilege('anon', 'public.business_empire_action(uuid,text,uuid,jsonb)', 'execute'),
  'plain anon role cannot execute gameplay action RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.business_empire_action(uuid,text,uuid,jsonb)', 'execute'),
  'authenticated JWT can execute gameplay action RPC before claim validation'
);
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname = 'business_empire_action'
     and pg_get_functiondef(p.oid) like '%private.require_authenticated_user()%'),
  1::bigint,
  'gameplay action uses the guest-eligible authenticated guard'
);
select is(
  (select count(*)
   from pg_policies
   where schemaname = 'public'
     and policyname in (
       'matches_permanent_gate',
       'match_players_permanent_gate',
       'match_events_permanent_gate',
       'business_empire_players_permanent_gate',
       'business_empire_owned_assets_permanent_gate'
     )),
  0::bigint,
  'gameplay tables no longer have the permanent-only restrictive gate'
);
select is(
  (select count(*)
   from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename in ('match_players', 'business_empire_players', 'business_empire_owned_assets')),
  3::bigint,
  'gameplay tables needed by the realtime board are published'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('84000000-0000-4000-8000-000000000001', null, '{"display_name":"guest host"}', true),
('84000000-0000-4000-8000-000000000002', null, '{"display_name":"guest challenger"}', true);

create temp table guest_gameplay_state (
  key text primary key,
  value text
);
grant all on guest_gameplay_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';

insert into guest_gameplay_state (key, value)
select 'room_id', r.id::text
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'public',
  2::smallint,
  '84100000-0000-4000-8000-000000000001'
) r;
insert into guest_gameplay_state (key, value)
select 'room_code', room_code
from public.game_rooms
where id = (select value::uuid from guest_gameplay_state where key = 'room_id');
select ok(
  (select value from guest_gameplay_state where key = 'room_id') is not null,
  'guest host can create a public two-player room'
);
select lives_ok(
  format(
    'select public.set_room_ready(%L::uuid, true, %L::jsonb)',
    (select value from guest_gameplay_state where key = 'room_id'),
    '{"character_key":"starlight-merchant"}'
  ),
  'guest host can ready with a business empire loadout'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000002';
select lives_ok(
  format(
    'select public.join_game_room(%L)',
    (select value from guest_gameplay_state where key = 'room_code')
  ),
  'second guest can join the public room'
);
select lives_ok(
  format(
    'select public.set_room_ready(%L::uuid, true, %L::jsonb)',
    (select value from guest_gameplay_state where key = 'room_id'),
    '{"character_key":"rune-artisan"}'
  ),
  'second guest can ready with a business empire loadout'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"84000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '84000000-0000-4000-8000-000000000001';

insert into guest_gameplay_state (key, value)
select 'match_id', m.id::text
from public.start_game_match(
  (select value::uuid from guest_gameplay_state where key = 'room_id'),
  '84100000-0000-4000-8000-000000000002'
) m;
select ok(
  (select value from guest_gameplay_state where key = 'match_id') is not null,
  'guest host can start a business empire match'
);
select is(
  (select count(*) from public.match_players
   where match_id = (select value::uuid from guest_gameplay_state where key = 'match_id')),
  2::bigint,
  'guest host can read match players after match start'
);
select is(
  (select count(*) from public.business_empire_players
   where match_id = (select value::uuid from guest_gameplay_state where key = 'match_id')),
  2::bigint,
  'guest host can read business empire player rows after match start'
);
select lives_ok(
  format(
    'select public.business_empire_action(%L::uuid, %L, %L::uuid, %L::jsonb)',
    (select value from guest_gameplay_state where key = 'match_id'),
    'roll',
    '84100000-0000-4000-8000-000000000003',
    '{}'
  ),
  'guest host can take the first server-authoritative roll'
);
select is(
  (select count(*) from public.match_events
   where match_id = (select value::uuid from guest_gameplay_state where key = 'match_id')
     and actor_user_id = '84000000-0000-4000-8000-000000000001'
     and event_type = 'roll'),
  1::bigint,
  'guest gameplay action writes a readable match event'
);

reset role;

select * from finish();
rollback;
