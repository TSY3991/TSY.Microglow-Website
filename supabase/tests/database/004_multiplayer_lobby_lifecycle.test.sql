begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(62);

select has_function('public', 'respond_room_invite', array['uuid','boolean','uuid'], 'room invite response RPC exists');
select has_function('public', 'cancel_match_queue', array['uuid','uuid'], 'queue cancellation RPC exists');
select has_function('public', 'leave_game_room', array['uuid','uuid'], 'leave room RPC exists');
select has_function('public', 'touch_room_presence', array['uuid'], 'room presence RPC exists');
select is_definer('public', 'respond_room_invite', array['uuid','boolean','uuid'], 'room invite response is security definer');
select is_definer('public', 'cancel_match_queue', array['uuid','uuid'], 'queue cancellation is security definer');
select is_definer('public', 'leave_game_room', array['uuid','uuid'], 'leave room is security definer');
select is_definer('public', 'touch_room_presence', array['uuid'], 'room presence is security definer');
select is(
  (select count(*)
   from unnest(array[
     'public.respond_room_invite(uuid,boolean,uuid)',
     'public.cancel_match_queue(uuid,uuid)',
     'public.leave_game_room(uuid,uuid)',
     'public.touch_room_presence(uuid)'
   ]) sig
   where has_function_privilege('authenticated', sig, 'execute')),
  4::bigint,
  'authenticated can execute all four lobby lifecycle RPCs'
);
select is(
  (select count(*)
   from unnest(array[
     'public.respond_room_invite(uuid,boolean,uuid)',
     'public.cancel_match_queue(uuid,uuid)',
     'public.leave_game_room(uuid,uuid)',
     'public.touch_room_presence(uuid)'
   ]) sig
   where has_function_privilege('anon', sig, 'execute')),
  0::bigint,
  'anon cannot execute lobby lifecycle RPCs'
);
select is(
  (select count(*)
   from pg_proc p
   join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public'
     and p.proname in (
       'respond_room_invite',
       'cancel_match_queue',
       'leave_game_room',
       'touch_room_presence'
     )
     and pg_get_functiondef(p.oid) like '%private.require_authenticated_user()%'),
  4::bigint,
  'all lobby lifecycle RPCs use the authenticated (guest-eligible) guard'
);
select is(
  (select count(*)
   from pg_constraint c
   join pg_class t on t.oid = c.conrelid
   join pg_namespace n on n.oid = t.relnamespace
   where n.nspname = 'public'
     and t.relname = 'room_members'
     and c.conname = 'room_members_seat_unique'),
  0::bigint,
  'historical members no longer use an unconditional seat constraint'
);
select has_index('public', 'room_members', 'room_members_active_seat_unique_idx', 'active seat partial unique index exists');
select has_index('public', 'match_queue', 'match_queue_waiting_expiry_idx', 'waiting queue expiry index exists');
select has_index('public', 'room_invites', 'room_invites_pending_expiry_idx', 'pending room invite expiry index exists');
select is(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = 'game_rooms'),
  1::bigint,
  'game_rooms is published to Realtime exactly once'
);
select is(
  (select count(*) from pg_publication_tables
   where pubname = 'supabase_realtime'
     and schemaname = 'public'
     and tablename = 'match_queue'),
  1::bigint,
  'match_queue is published to Realtime exactly once'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous)
select
  ('82000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'member' || i::text || '@example.test',
  '{}'::jsonb,
  false
from generate_series(1, 20) i;

insert into public.friendships (user_a, user_b)
values
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000002'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000003'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000004'),
  ('82000000-0000-4000-8000-000000000001', '82000000-0000-4000-8000-000000000005'),
  ('82000000-0000-4000-8000-000000000010', '82000000-0000-4000-8000-000000000011');

create temp table lifecycle_state (
  key text primary key,
  value text,
  payload jsonb
);
grant all on lifecycle_state to authenticated;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';

insert into lifecycle_state (key, value, payload)
select 'accept_room', r.id::text, jsonb_build_object('code', r.room_code)
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'private',
  2::smallint,
  '82100000-0000-4000-8000-000000000001'
) r;
insert into lifecycle_state (key, value)
select 'accept_invite', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'accept_room'),
  '82000000-0000-4000-8000-000000000002',
  '82100000-0000-4000-8000-000000000002'
) ri;

insert into lifecycle_state (key, value, payload)
select 'full_room', r.id::text, jsonb_build_object('code', r.room_code)
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'private',
  2::smallint,
  '82100000-0000-4000-8000-000000000003'
) r;
insert into lifecycle_state (key, value)
select 'full_invite_member2', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'full_room'),
  '82000000-0000-4000-8000-000000000002',
  '82100000-0000-4000-8000-000000000004'
) ri;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000003';
select throws_ok(
  format(
    'select public.respond_room_invite(%L::uuid,true,%L::uuid)',
    (select value from lifecycle_state where key = 'accept_invite'),
    '82100000-0000-4000-8000-000000000005'
  ),
  '42501',
  'Room invite not found',
  'non-receiver cannot answer a room invite'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select is(
  (public.respond_room_invite(
    (select value::uuid from lifecycle_state where key = 'accept_invite'),
    true,
    '82100000-0000-4000-8000-000000000006'
  )).status::text,
  'accepted',
  'receiver can accept a room invite'
);
select is(
  (select count(*) from public.room_members
   where room_id = (select value::uuid from lifecycle_state where key = 'accept_room')
     and user_id = '82000000-0000-4000-8000-000000000002'
     and status = 'joined'),
  1::bigint,
  'accepting an invite creates one active room member'
);
select is(
  (public.respond_room_invite(
    (select value::uuid from lifecycle_state where key = 'accept_invite'),
    true,
    '82100000-0000-4000-8000-000000000006'
  )).status::text,
  'accepted',
  'repeating the same room invite request is idempotent'
);
select is(
  (select count(*) from public.room_members
   where room_id = (select value::uuid from lifecycle_state where key = 'accept_room')
     and user_id = '82000000-0000-4000-8000-000000000002'),
  1::bigint,
  'idempotent room invite response does not duplicate membership'
);
select throws_ok(
  format(
    'select public.respond_room_invite(%L::uuid,false,%L::uuid)',
    (select value from lifecycle_state where key = 'accept_invite'),
    '82100000-0000-4000-8000-000000000007'
  ),
  '55000',
  'Invite already answered',
  'an accepted invite cannot later be declined'
);
select is(
  (public.respond_room_invite(
    (select value::uuid from lifecycle_state where key = 'full_invite_member2'),
    true,
    '82100000-0000-4000-8000-000000000008'
  )).status::text,
  'accepted',
  'second user fills a two-player room'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';
insert into lifecycle_state (key, value)
select 'full_invite_member3', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'full_room'),
  '82000000-0000-4000-8000-000000000003',
  '82100000-0000-4000-8000-000000000009'
) ri;
insert into lifecycle_state (key, value)
select 'expired_invite', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'full_room'),
  '82000000-0000-4000-8000-000000000004',
  '82100000-0000-4000-8000-000000000010'
) ri;
insert into lifecycle_state (key, value)
select 'decline_invite', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'full_room'),
  '82000000-0000-4000-8000-000000000005',
  '82100000-0000-4000-8000-000000000011'
) ri;
reset role;

update public.room_invites
set expires_at = now() - interval '1 minute'
where id = (select value::uuid from lifecycle_state where key = 'expired_invite');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000003","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000003';
select throws_ok(
  format(
    'select public.respond_room_invite(%L::uuid,true,%L::uuid)',
    (select value from lifecycle_state where key = 'full_invite_member3'),
    '82100000-0000-4000-8000-000000000012'
  ),
  '55000',
  'Room is full',
  'accepting an invite cannot exceed room capacity'
);
reset role;
select is(
  (select status::text from public.room_invites
   where id = (select value::uuid from lifecycle_state where key = 'full_invite_member3')),
  'pending',
  'a full-room failure leaves the invite pending'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000004","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000004';
select is(
  (public.respond_room_invite(
    (select value::uuid from lifecycle_state where key = 'expired_invite'),
    true,
    '82100000-0000-4000-8000-000000000013'
  )).status::text,
  'expired',
  'an expired room invite is persisted and returned'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000005';
select is(
  (public.respond_room_invite(
    (select value::uuid from lifecycle_state where key = 'decline_invite'),
    false,
    '82100000-0000-4000-8000-000000000014'
  )).status::text,
  'declined',
  'receiver can decline a room invite'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000005","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000005';
select lives_ok(
  format(
    'select public.respond_room_invite(%L::uuid,false,%L::uuid)',
    (select value from lifecycle_state where key = 'decline_invite'),
    '82100000-0000-4000-8000-000000000015'
  ),
  'anonymous JWT can answer room invites (guest multiplayer access)'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000006","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000006';
insert into lifecycle_state (key, value)
select 'queue_cancel', q.id::text
from public.enqueue_match(
  'microglow-business-empire',
  'double-ring-city',
  '82200000-0000-4000-8000-000000000001'
) q;
select is(
  (public.cancel_match_queue(
    (select value::uuid from lifecycle_state where key = 'queue_cancel'),
    '82200000-0000-4000-8000-000000000002'
  )).status::text,
  'cancelled',
  'waiting queue can be cancelled'
);
select is(
  (public.cancel_match_queue(
    (select value::uuid from lifecycle_state where key = 'queue_cancel'),
    '82200000-0000-4000-8000-000000000002'
  )).status::text,
  'cancelled',
  'queue cancellation is idempotent'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000007","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000007';
insert into lifecycle_state (key, value)
select 'queue_expired', q.id::text
from public.enqueue_match(
  'microglow-business-empire',
  'double-ring-city',
  '82200000-0000-4000-8000-000000000003'
) q;
reset role;
update public.match_queue
set expires_at = now() - interval '1 minute'
where id = (select value::uuid from lifecycle_state where key = 'queue_expired');

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000007","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000007';
select is(
  (public.cancel_match_queue(
    (select value::uuid from lifecycle_state where key = 'queue_expired'),
    '82200000-0000-4000-8000-000000000004'
  )).status::text,
  'expired',
  'expired waiting queue is marked expired when cancelled'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000009","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000009';
insert into lifecycle_state (key, value)
select 'queue_other', q.id::text
from public.enqueue_match(
  'microglow-business-empire',
  'double-ring-city',
  '82200000-0000-4000-8000-000000000005'
) q;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000008","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000008';
select throws_ok(
  format(
    'select public.cancel_match_queue(%L::uuid,%L::uuid)',
    (select value from lifecycle_state where key = 'queue_other'),
    '82200000-0000-4000-8000-000000000006'
  ),
  '42501',
  'Match queue not found',
  'non-owner cannot cancel another queue row'
);
reset role;
update public.match_queue
set status = 'cancelled'
where id = (select value::uuid from lifecycle_state where key = 'queue_other');

with inserted as (
  insert into public.match_queue (
    user_id, game_key, map_id, status, request_id, matched_room_id, matched_at
  )
  values (
    '82000000-0000-4000-8000-000000000008',
    'microglow-business-empire',
    '39910000-0000-4000-8000-000000000001',
    'matched',
    '82200000-0000-4000-8000-000000000007',
    (select value::uuid from lifecycle_state where key = 'accept_room'),
    now()
  )
  returning id
)
insert into lifecycle_state (key, value)
select 'queue_matched', id::text from inserted;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000008","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000008';
select throws_ok(
  format(
    'select public.cancel_match_queue(%L::uuid,%L::uuid)',
    (select value from lifecycle_state where key = 'queue_matched'),
    '82200000-0000-4000-8000-000000000008'
  ),
  '55000',
  'Match already assigned',
  'matched queue cannot be cancelled'
);
reset role;
select is(
  (select matched_room_id::text from public.match_queue
   where id = (select value::uuid from lifecycle_state where key = 'queue_matched')),
  (select value from lifecycle_state where key = 'accept_room'),
  'failed matched cancellation preserves matched_room_id'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000006","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000006';
insert into lifecycle_state (key, value, payload)
select 'leave_room', r.id::text, jsonb_build_object('code', r.room_code)
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'public',
  4::smallint,
  '82300000-0000-4000-8000-000000000001'
) r;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000007","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000007';
select public.join_game_room((select payload->>'code' from lifecycle_state where key = 'leave_room'));
select is(
  public.leave_game_room(
    (select value::uuid from lifecycle_state where key = 'leave_room'),
    '82300000-0000-4000-8000-000000000002'
  ) ->> 'member_status',
  'left',
  'ordinary member can leave a lobby'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000008","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000008';
select public.join_game_room((select payload->>'code' from lifecycle_state where key = 'leave_room'));
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000009","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000009';
select public.join_game_room((select payload->>'code' from lifecycle_state where key = 'leave_room'));
reset role;
select is(
  (select seat_number from public.room_members
   where room_id = (select value::uuid from lifecycle_state where key = 'leave_room')
     and user_id = '82000000-0000-4000-8000-000000000008'),
  2::smallint,
  'a new player can reuse a left member seat'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000006","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000006';
insert into lifecycle_state (key, payload)
select 'host_leave_result', public.leave_game_room(
  (select value::uuid from lifecycle_state where key = 'leave_room'),
  '82300000-0000-4000-8000-000000000003'
);
select is(
  (select payload->>'new_host_user_id' from lifecycle_state where key = 'host_leave_result'),
  '82000000-0000-4000-8000-000000000008',
  'host transfers to the lowest connected seat'
);
reset role;
select is(
  (select count(*) from public.notifications
   where user_id = '82000000-0000-4000-8000-000000000008'
     and event_type = 'room_host_transferred'
     and data->>'room_id' = (select value from lifecycle_state where key = 'leave_room')),
  1::bigint,
  'host transfer creates one notification'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000006","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000006';
select is(
  public.leave_game_room(
    (select value::uuid from lifecycle_state where key = 'leave_room'),
    '82300000-0000-4000-8000-000000000003'
  ) ->> 'new_host_user_id',
  '82000000-0000-4000-8000-000000000008',
  'repeating host leave returns the original result'
);
reset role;
select is(
  (select count(*) from public.notifications
   where user_id = '82000000-0000-4000-8000-000000000008'
     and event_type = 'room_host_transferred'
     and data->>'room_id' = (select value from lifecycle_state where key = 'leave_room')),
  1::bigint,
  'idempotent host leave does not duplicate notification'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000010","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000010';
insert into lifecycle_state (key, value)
select 'solo_room', r.id::text
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'private',
  2::smallint,
  '82300000-0000-4000-8000-000000000004'
) r;
insert into lifecycle_state (key, value)
select 'solo_invite', ri.id::text
from public.invite_friend_to_room(
  (select value::uuid from lifecycle_state where key = 'solo_room'),
  '82000000-0000-4000-8000-000000000011',
  '82300000-0000-4000-8000-000000000005'
) ri;
select is(
  public.leave_game_room(
    (select value::uuid from lifecycle_state where key = 'solo_room'),
    '82300000-0000-4000-8000-000000000006'
  ) ->> 'room_status',
  'abandoned',
  'solo host leaving abandons the room'
);
reset role;
select is(
  (select status::text from public.room_invites
   where id = (select value::uuid from lifecycle_state where key = 'solo_invite')),
  'cancelled',
  'abandoning a room cancels pending room invites'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000012","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000012';
insert into lifecycle_state (key, value, payload)
select 'presence_room', r.id::text, jsonb_build_object('code', r.room_code)
from public.create_game_room(
  'microglow-business-empire',
  'double-ring-city',
  'public',
  2::smallint,
  '82400000-0000-4000-8000-000000000001'
) r;
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000013","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000013';
select public.join_game_room((select payload->>'code' from lifecycle_state where key = 'presence_room'));
reset role;

update public.room_members
set status = 'disconnected',
    is_ready = true,
    disconnected_at = now() - interval '1 minute',
    last_seen_at = now() - interval '3 minutes'
where room_id = (select value::uuid from lifecycle_state where key = 'presence_room')
  and user_id = '82000000-0000-4000-8000-000000000013';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000013","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000013';
select is(
  (public.touch_room_presence(
    (select value::uuid from lifecycle_state where key = 'presence_room')
  )).status::text,
  'ready',
  'ready disconnected member recovers to ready'
);
reset role;

update public.room_members
set status = 'disconnected',
    is_ready = false,
    disconnected_at = now() - interval '1 minute',
    last_seen_at = now() - interval '3 minutes'
where room_id = (select value::uuid from lifecycle_state where key = 'presence_room')
  and user_id = '82000000-0000-4000-8000-000000000013';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000013","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000013';
select is(
  (public.touch_room_presence(
    (select value::uuid from lifecycle_state where key = 'presence_room')
  )).status::text,
  'joined',
  'non-ready disconnected member recovers to joined'
);
reset role;

update public.room_members
set status = 'left',
    left_at = now()
where room_id = (select value::uuid from lifecycle_state where key = 'presence_room')
  and user_id = '82000000-0000-4000-8000-000000000013';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000013","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000013';
select throws_ok(
  format(
    'select public.touch_room_presence(%L::uuid)',
    (select value from lifecycle_state where key = 'presence_room')
  ),
  '42501',
  'Active room membership required',
  'left member cannot heartbeat into a room'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';
select public.set_room_ready(
  (select value::uuid from lifecycle_state where key = 'accept_room'),
  true,
  '{"character_key":"starlight-merchant"}'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select public.set_room_ready(
  (select value::uuid from lifecycle_state where key = 'accept_room'),
  true,
  '{"character_key":"rune-artisan"}'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000001';
insert into lifecycle_state (key, value)
select 'started_match', m.id::text
from public.start_game_match(
  (select value::uuid from lifecycle_state where key = 'accept_room'),
  '82400000-0000-4000-8000-000000000002'
) m;
select throws_ok(
  format(
    'select public.leave_game_room(%L::uuid,%L::uuid)',
    (select value from lifecycle_state where key = 'accept_room'),
    '82400000-0000-4000-8000-000000000003'
  ),
  '55000',
  'Only lobby rooms can be left',
  'member cannot leave through lobby RPC after match starts'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000002';
select throws_ok(
  format(
    'select public.touch_room_presence(%L::uuid)',
    (select value from lifecycle_state where key = 'accept_room')
  ),
  '55000',
  'Room presence is only available in lobby',
  'in-progress room uses match connection instead of lobby heartbeat'
);
reset role;

insert into public.game_maps (
  id, game_key, map_key, title, min_players, max_players, is_active
)
values
  ('83000000-0000-4000-8000-000000000001', 'microglow-business-empire', 'test-map-a', '測試地圖 A', 2, 4, true),
  ('83000000-0000-4000-8000-000000000002', 'microglow-business-empire', 'test-map-b', '測試地圖 B', 2, 4, true);

insert into public.match_queue (
  user_id, game_key, map_id, status, request_id, queued_at, expires_at
)
values
  ('82000000-0000-4000-8000-000000000014', 'microglow-business-empire', '83000000-0000-4000-8000-000000000001', 'waiting', '82500000-0000-4000-8000-000000000001', now() - interval '3 minutes', now() + interval '10 minutes'),
  ('82000000-0000-4000-8000-000000000015', 'microglow-business-empire', '83000000-0000-4000-8000-000000000002', 'waiting', '82500000-0000-4000-8000-000000000002', now() - interval '2 minutes', now() + interval '10 minutes'),
  ('82000000-0000-4000-8000-000000000016', 'microglow-business-empire', '83000000-0000-4000-8000-000000000002', 'waiting', '82500000-0000-4000-8000-000000000003', now() - interval '1 minute', now() + interval '10 minutes');

select is(private.run_matchmaking_once(), 2, 'eligible later queue group is not blocked by an earlier undersized group');
select is(
  (select status::text from public.match_queue
   where user_id = '82000000-0000-4000-8000-000000000014'),
  'waiting',
  'undersized queue group remains waiting'
);
select is(
  (select count(*) from public.match_queue
   where user_id in (
     '82000000-0000-4000-8000-000000000015',
     '82000000-0000-4000-8000-000000000016'
   )
     and status = 'matched'),
  2::bigint,
  'two eligible players are matched together'
);
insert into lifecycle_state (key, value)
select 'matched_two_room', matched_room_id::text
from public.match_queue
where user_id = '82000000-0000-4000-8000-000000000015';
select is(
  (select status::text from public.game_rooms
   where id = (select value::uuid from lifecycle_state where key = 'matched_two_room')),
  'lobby',
  'matchmaking creates a lobby instead of starting a match'
);
select is(
  (select current_match_id from public.game_rooms
   where id = (select value::uuid from lifecycle_state where key = 'matched_two_room')),
  null::uuid,
  'matched lobby has no match before host action'
);
select is(
  (select host_user_id from public.game_rooms
   where id = (select value::uuid from lifecycle_state where key = 'matched_two_room')),
  '82000000-0000-4000-8000-000000000015'::uuid,
  'earliest queued player becomes matched lobby host'
);
select is(
  (select count(*) from public.matches
   where room_id = (select value::uuid from lifecycle_state where key = 'matched_two_room')),
  0::bigint,
  'matchmaking does not auto-start a game'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000016","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000016';
select public.set_room_ready(
  (select value::uuid from lifecycle_state where key = 'matched_two_room'),
  false,
  '{}'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000015","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000015';
select throws_ok(
  format(
    'select public.start_game_match(%L::uuid,%L::uuid)',
    (select value from lifecycle_state where key = 'matched_two_room'),
    '82500000-0000-4000-8000-000000000004'
  ),
  '55000',
  'All players must be ready',
  'host cannot start while a matched player is not ready'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000016","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000016';
select public.set_room_ready(
  (select value::uuid from lifecycle_state where key = 'matched_two_room'),
  true,
  '{}'
);
reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"82000000-0000-4000-8000-000000000015","role":"authenticated","is_anonymous":false}',
  true
);
set local request.jwt.claim.sub = '82000000-0000-4000-8000-000000000015';
select ok(
  (public.start_game_match(
    (select value::uuid from lifecycle_state where key = 'matched_two_room'),
    '82500000-0000-4000-8000-000000000005'
  )).id is not null,
  'host action creates the match after everyone is ready'
);
reset role;
select is(
  (select status::text from public.game_rooms
   where id = (select value::uuid from lifecycle_state where key = 'matched_two_room')),
  'in_progress',
  'host-started matched lobby becomes in progress'
);

insert into public.match_queue (
  user_id, game_key, map_id, status, request_id, queued_at, expires_at
)
select
  ('82000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  'microglow-business-empire',
  '39910000-0000-4000-8000-000000000001',
  'waiting',
  ('82600000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
  now() + make_interval(secs => i),
  now() + interval '10 minutes'
from generate_series(17, 20) i;

select is(private.run_matchmaking_once(), 4, 'matcher creates a four-player lobby when four are waiting');
insert into lifecycle_state (key, value)
select 'matched_four_room', matched_room_id::text
from public.match_queue
where user_id = '82000000-0000-4000-8000-000000000017';
select is(
  (select max_players from public.game_rooms
   where id = (select value::uuid from lifecycle_state where key = 'matched_four_room')),
  4::smallint,
  'four-player match lobby records an exact capacity of four'
);
select is(
  (select count(*) from public.room_members
   where room_id = (select value::uuid from lifecycle_state where key = 'matched_four_room')
     and status = 'ready'
     and is_ready),
  4::bigint,
  'all four matched players begin ready in the lobby'
);
select results_eq(
  $$select status::text from public.match_queue
    where id in (
      (select value::uuid from lifecycle_state where key = 'queue_cancel'),
      (select value::uuid from lifecycle_state where key = 'queue_expired')
    )
    order by status::text$$,
  array['cancelled'::text, 'expired'::text],
  'cancelled and expired queues never re-enter matchmaking'
);

select * from finish();
rollback;
