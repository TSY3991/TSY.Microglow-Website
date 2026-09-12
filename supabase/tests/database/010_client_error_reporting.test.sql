begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select has_function('public', 'report_client_error',
  array['text','text','text','text','text','jsonb'],
  'report_client_error RPC exists');
select is_definer('public', 'report_client_error',
  array['text','text','text','text','text','jsonb'],
  'report_client_error is security definer');
select ok(has_function_privilege('anon',
  'public.report_client_error(text,text,text,text,text,jsonb)', 'execute'),
  'anon can report client errors (fires before login)');
select ok(has_function_privilege('authenticated',
  'public.report_client_error(text,text,text,text,text,jsonb)', 'execute'),
  'authenticated can report client errors');

-- Anon path lands a row with null user_id.
set local role anon;
select public.report_client_error(
  'business-empire', 'boom', 'Error: boom\n at foo', 'https://x/y', 'UA/1', '{"k":"v"}'::jsonb);
reset role;
select is(
  (select count(*)::int from private.client_errors
     where app = 'business-empire' and message = 'boom' and user_id is null),
  1,
  'anon insert lands one row with null user_id');

-- Authenticated path stamps user_id from JWT.
insert into auth.users (id, email, raw_user_meta_data, is_anonymous) values
('91000000-0000-4000-8000-000000000001', null, '{"display_name":"err reporter"}', true);
set local role authenticated;
select set_config('request.jwt.claims',
  '{"sub":"91000000-0000-4000-8000-000000000001","role":"authenticated","is_anonymous":true}', true);
set local request.jwt.claim.sub = '91000000-0000-4000-8000-000000000001';
select public.report_client_error(
  'business-empire', 'auth-boom', null, 'https://x/z', 'UA/2', '{}'::jsonb);
reset role;
select is(
  (select count(*)::int from private.client_errors
     where message = 'auth-boom'
       and user_id = '91000000-0000-4000-8000-000000000001'::uuid),
  1,
  'authenticated insert stamps user_id from JWT');

-- Defensive truncation: over-long strings are capped, not rejected.
set local role anon;
select public.report_client_error(
  'business-empire',
  repeat('x', 5000),
  repeat('s', 10000),
  repeat('u', 2000),
  repeat('a', 800),
  '{}'::jsonb);
reset role;
select is(
  (select length(message) from private.client_errors
     where app = 'business-empire' and message like 'xxxx%'
     order by id desc limit 1),
  500, 'message is truncated to 500 chars');
select is(
  (select length(stack) from private.client_errors
     where app = 'business-empire' and stack like 'ssss%'
     order by id desc limit 1),
  4000, 'stack is truncated to 4000 chars');

-- Oversized context object is replaced with a _truncated marker instead of stored raw.
set local role anon;
select public.report_client_error(
  'business-empire', 'ctx-blast', null, null, null,
  jsonb_build_object('blob', repeat('B', 3000)));
reset role;
select is(
  (select context from private.client_errors
     where message = 'ctx-blast' order by id desc limit 1),
  '{"_truncated": true}'::jsonb,
  'oversized context is replaced with _truncated marker');

select * from finish();
rollback;
