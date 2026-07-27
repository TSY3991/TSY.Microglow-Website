begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select has_column('public', 'profiles', 'player_code', 'profiles has a player_code column');
select ok(
  exists (
    select 1
    from pg_index i
    join pg_class c on c.oid = i.indrelid
    join pg_namespace n on n.oid = c.relnamespace
    join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
    where n.nspname = 'public'
      and c.relname = 'profiles'
      and i.indisunique
      and a.attname = 'player_code'
  ),
  'player_code has a unique index'
);
select col_not_null('public', 'profiles', 'player_code', 'player_code is not null');
select has_function('private', 'require_authenticated_user', array[]::text[], 'authenticated-only guard exists');
select has_function('public', 'send_friend_invite_by_code', array['text', 'uuid'], 'code-based friend invite RPC exists');
select is_definer('public', 'send_friend_invite_by_code', array['text', 'uuid'], 'code-based friend invite is security definer');
select ok(
  not has_function_privilege('anon', 'public.send_friend_invite_by_code(text,uuid)', 'execute'),
  'plain anon role cannot execute the code-based friend invite RPC'
);
select ok(
  has_function_privilege('authenticated', 'public.send_friend_invite_by_code(text,uuid)', 'execute'),
  'authenticated JWT can reach the code-based friend invite RPC before claim validation'
);

insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('83000000-0000-4000-8000-000000000001', null, '{"display_name":"訪客甲"}', true),
('83000000-0000-4000-8000-000000000002', null, '{"display_name":"訪客乙"}', true);

select ok(
  (select player_code from public.profiles where id = '83000000-0000-4000-8000-000000000001') is not null,
  'a new guest profile automatically receives a player_code'
);

create temp table guest_access_state (
  key text primary key,
  value text
);
grant all on guest_access_state to authenticated;

-- Captured now (superuser context, RLS not yet in effect) because a guest's
-- private profile cannot be read by a different guest once RLS applies --
-- the code has to be shared out-of-band, not looked up via a SELECT.
insert into guest_access_state (key, value)
select 'guest2_code', player_code from public.profiles where id = '83000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000001';

select lives_ok(
  format(
    'select public.enqueue_match(%L, %L, %L::uuid)',
    'microglow-business-empire', 'double-ring-city', '83100000-0000-4000-8000-000000000001'
  ),
  'a guest can join the matchmaking queue'
);

insert into guest_access_state (key, value)
select 'guest_room', r.id::text
from public.create_game_room(
  'microglow-business-empire', 'double-ring-city', 'private', 2::smallint,
  '83100000-0000-4000-8000-000000000002'
) r;
select ok(
  (select value from guest_access_state where key = 'guest_room') is not null,
  'a guest can create a friend room'
);

select throws_ok(
  format(
    'select public.send_friend_invite(%L::uuid, %L::uuid)',
    '83000000-0000-4000-8000-000000000002', '83100000-0000-4000-8000-000000000003'
  ),
  '42501',
  'Permanent account required',
  'a guest still cannot use the username-search friend invite RPC'
);

select lives_ok(
  format(
    'select public.send_friend_invite_by_code(%L, %L::uuid)',
    (select value from guest_access_state where key = 'guest2_code'),
    '83100000-0000-4000-8000-000000000004'
  ),
  'a guest can send a friend invite using the other guest''s player code'
);

select is(
  (select count(*) from public.friend_invites
   where sender_id = '83000000-0000-4000-8000-000000000001'
     and receiver_id = '83000000-0000-4000-8000-000000000002'
     and status = 'pending'),
  1::bigint,
  'the code-based invite creates exactly one pending friend_invites row'
);

reset role;

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"83000000-0000-4000-8000-000000000002","role":"authenticated","is_anonymous":true}',
  true
);
set local request.jwt.claim.sub = '83000000-0000-4000-8000-000000000002';

select is(
  (public.respond_friend_invite(
    (select id from public.friend_invites
     where sender_id = '83000000-0000-4000-8000-000000000001'
       and receiver_id = '83000000-0000-4000-8000-000000000002'),
    true
  )).status::text,
  'accepted',
  'the other guest can accept the code-based friend invite'
);
select is(
  (select count(*) from public.friendships
   where least(user_a, user_b) = least('83000000-0000-4000-8000-000000000001'::uuid, '83000000-0000-4000-8000-000000000002'::uuid)
     and greatest(user_a, user_b) = greatest('83000000-0000-4000-8000-000000000001'::uuid, '83000000-0000-4000-8000-000000000002'::uuid)),
  1::bigint,
  'accepting the invite creates a friendship row between the two guests'
);

reset role;

select * from finish();
rollback;
