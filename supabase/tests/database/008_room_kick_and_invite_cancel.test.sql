begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(15);

select has_function(
  'public', 'remove_room_member', array['uuid','uuid','uuid'],
  'remove room member RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.remove_room_member(uuid,uuid,uuid)', 'execute'),
  'plain anon role cannot execute remove_room_member'
);
select ok(
  has_function_privilege('authenticated', 'public.remove_room_member(uuid,uuid,uuid)', 'execute'),
  'authenticated JWT can execute remove_room_member before claim validation'
);
select has_function(
  'public', 'cancel_friend_invite', array['uuid'],
  'cancel friend invite RPC exists'
);
select ok(
  not has_function_privilege('anon', 'public.cancel_friend_invite(uuid)', 'execute'),
  'plain anon role cannot execute cancel_friend_invite'
);
select ok(
  has_function_privilege('authenticated', 'public.cancel_friend_invite(uuid)', 'execute'),
  'authenticated JWT can execute cancel_friend_invite before claim validation'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('86000000-0000-4000-8000-000000000001', null, '{"display_name":"kick host"}', true),
('86000000-0000-4000-8000-000000000002', null, '{"display_name":"kick target"}', true);

create temp table kick_state (key text primary key, value text);
grant all on kick_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
insert into kick_state (key, value)
select 'room_id', r.id::text
from public.create_game_room(
  'microglow-business-empire', 'double-ring-city', 'public', 2::smallint,
  '86100000-0000-4000-8000-000000000001'
) r;
insert into kick_state (key, value)
select 'room_code', room_code from public.game_rooms
where id = (select value::uuid from kick_state where key = 'room_id');
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select public.join_game_room((select value from kick_state where key = 'room_code'));
select throws_ok(
  format('select public.remove_room_member(%L::uuid, %L::uuid, %L::uuid)',
    (select value from kick_state where key = 'room_id'),
    '86000000-0000-4000-8000-000000000001',
    '86200000-0000-4000-8000-000000000001'),
  '42501',
  'Room host required',
  'a non-host member cannot kick anyone'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select throws_ok(
  format('select public.remove_room_member(%L::uuid, %L::uuid, %L::uuid)',
    (select value from kick_state where key = 'room_id'),
    '86000000-0000-4000-8000-000000000001',
    '86200000-0000-4000-8000-000000000002'),
  '22023',
  'Use leave_game_room to leave your own room',
  'the host cannot kick themselves'
);
select lives_ok(
  format('select public.remove_room_member(%L::uuid, %L::uuid, %L::uuid)',
    (select value from kick_state where key = 'room_id'),
    '86000000-0000-4000-8000-000000000002',
    '86200000-0000-4000-8000-000000000003'),
  'the host can kick another active member'
);
select is(
  (select status::text from public.room_members
   where room_id = (select value::uuid from kick_state where key = 'room_id')
     and user_id = '86000000-0000-4000-8000-000000000002'),
  'kicked',
  'the kicked member is marked kicked'
);
select throws_ok(
  format('select public.remove_room_member(%L::uuid, %L::uuid, %L::uuid)',
    (select value from kick_state where key = 'room_id'),
    '86000000-0000-4000-8000-000000000002',
    '86200000-0000-4000-8000-000000000004'),
  '42501',
  'Target is not an active room member',
  'kicking an already-kicked member is rejected'
);
reset role;

-- Cancel friend invite: host sends an invite by player code, then cancels it.
-- Reading someone else's player_code needs a superuser/table-owner context: RLS
-- restricts profiles to your own row (player codes are shared out of band, not searchable).
insert into kick_state (key, value)
select 'target_code', player_code from public.profiles
where id = '86000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
insert into kick_state (key, value)
select 'invite_id', i.id::text
from public.send_friend_invite_by_code(
  (select value from kick_state where key = 'target_code'),
  '86200000-0000-4000-8000-000000000005'
) i;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000002';
select throws_ok(
  format('select public.cancel_friend_invite(%L::uuid)',
    (select value from kick_state where key = 'invite_id')),
  'P0001',
  'Invite not found',
  'only the sender can cancel a friend invite'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"86000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '86000000-0000-4000-8000-000000000001';
select lives_ok(
  format('select public.cancel_friend_invite(%L::uuid)',
    (select value from kick_state where key = 'invite_id')),
  'the sender can cancel their own pending invite'
);
select is(
  (select status::text from public.friend_invites
   where id = (select value::uuid from kick_state where key = 'invite_id')),
  'cancelled',
  'the invite is marked cancelled'
);
select throws_ok(
  format('select public.cancel_friend_invite(%L::uuid)',
    (select value from kick_state where key = 'invite_id')),
  'P0001',
  'Invite is no longer pending',
  'cancelling an already-cancelled invite is rejected'
);
reset role;

select * from finish();
rollback;
