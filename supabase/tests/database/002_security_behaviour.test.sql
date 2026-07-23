begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

insert into auth.users (id,email,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','u1@example.test','{}'),
('10000000-0000-4000-8000-000000000002','u2@example.test','{}'),
('10000000-0000-4000-8000-000000000003','u3@example.test','{}'),
('10000000-0000-4000-8000-000000000004','u4@example.test','{}'),
('10000000-0000-4000-8000-000000000005','u5@example.test','{}');

create temp table test_state (key text primary key, value text, payload jsonb);
grant all on test_state to authenticated;

set local role anon;
select throws_ok('select * from public.user_settings', '42501', null, 'anonymous user cannot read private settings');
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select lives_ok($profile$update public.profiles set display_name='Owner Updated' where id='10000000-0000-4000-8000-000000000001'$profile$, 'player can update own profile');
select results_eq($profile$update public.profiles set display_name='Tampered' where id='10000000-0000-4000-8000-000000000002' returning id$profile$, array[]::uuid[], 'player cannot update another profile');
select results_eq($$select count(*) from public.user_settings where user_id='10000000-0000-4000-8000-000000000002'$$, array[0::bigint], 'player cannot read another user settings');
select public.send_friend_invite('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001');
select throws_ok($$select public.send_friend_invite('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002')$$, null, null, 'duplicate pending friend invite is rejected');
insert into test_state(key,value) select 'private_room',(public.create_game_room('microglow-business-empire','double-ring-city','private',2::smallint,'30000000-0000-4000-8000-000000000001')).id::text;
insert into test_state(key,value,payload) select 'full_room',r.id::text,jsonb_build_object('code',r.room_code) from public.create_game_room('microglow-business-empire','double-ring-city','public',4::smallint,'30000000-0000-4000-8000-000000000002') r;
insert into test_state(key,value,payload) select 'match_room',r.id::text,jsonb_build_object('code',r.room_code) from public.create_game_room('microglow-business-empire','double-ring-city','public',2::smallint,'30000000-0000-4000-8000-000000000003') r;
reset role;

set local role authenticated;
set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select results_eq(format('select count(*) from public.game_rooms where id=%L::uuid',(select value from test_state where key='private_room')),array[0::bigint],'non-member cannot read private room');
select public.join_game_room((select payload->>'code' from test_state where key='full_room'));
select public.join_game_room((select payload->>'code' from test_state where key='match_room'));
select public.set_room_ready((select value::uuid from test_state where key='match_room'),true,jsonb_build_object('character_key','rune-artisan'));
reset role;

set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000003';
select public.join_game_room((select payload->>'code' from test_state where key='full_room'));
reset role;
set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000004';
select public.join_game_room((select payload->>'code' from test_state where key='full_room'));
reset role;
set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000005';
select throws_ok(format('select public.join_game_room(%L)',(select payload->>'code' from test_state where key='full_room')),null,null,'fifth player cannot join four-player room');
reset role;

set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
select public.set_room_ready((select value::uuid from test_state where key='match_room'),true,jsonb_build_object('character_key','starlight-merchant'));
insert into test_state(key,value) select 'match',(public.start_game_match((select value::uuid from test_state where key='match_room'),'40000000-0000-4000-8000-000000000001')).id::text;
reset role;

set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000002';
select throws_ok(format('select public.business_empire_action(%L::uuid,%L,%L::uuid,%L::jsonb)',(select value from test_state where key='match'),'roll','50000000-0000-4000-8000-000000000001','{}'),null,null,'non-current player cannot act');
select public.set_match_connection((select value::uuid from test_state where key='match'),false);
select is((public.set_match_connection((select value::uuid from test_state where key='match'),true)).is_connected,true,'disconnected player can rejoin match');
reset role;

set local role authenticated; set local request.jwt.claim.sub = '10000000-0000-4000-8000-000000000001';
insert into test_state(key,payload) select 'roll',public.business_empire_action((select value::uuid from test_state where key='match'),'roll','50000000-0000-4000-8000-000000000002','{"dice":99}');
select ok(((select payload->>'dice' from test_state where key='roll')::int between 1 and 6) and ((select payload->>'dice' from test_state where key='roll')::int <> 99),'client cannot choose dice result');
insert into test_state(key,value) select 'product',(public.create_radar_product('4710000000001','測試商品',null,null,null,null,null,'60000000-0000-4000-8000-000000000001')).id::text;
insert into test_state(key,value) select 'price1',(public.record_radar_price((select id from public.radar_sources where source_key='pxmart'),(select value::uuid from test_state where key='product'),99,null,'regular',now(),'70000000-0000-4000-8000-000000000001')).id::text;
insert into test_state(key,value) select 'price2',(public.record_radar_price((select id from public.radar_sources where source_key='pxmart'),(select value::uuid from test_state where key='product'),99,null,'regular',now(),'70000000-0000-4000-8000-000000000002')).id::text;
select is((select value from test_state where key='price1'),(select value from test_state where key='price2'),'duplicate source/product/time price returns existing record');
reset role;

select * from finish();
rollback;
