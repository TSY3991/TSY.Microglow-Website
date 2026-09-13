begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(7);

select has_function('public', 'get_client_min_version', array['text'],
  'get_client_min_version RPC exists');
select is_definer('public', 'get_client_min_version', array['text'],
  'get_client_min_version is security definer');
select ok(has_function_privilege('anon',
  'public.get_client_min_version(text)', 'execute'),
  'anon can read min version (fires before login)');
select ok(has_function_privilege('authenticated',
  'public.get_client_min_version(text)', 'execute'),
  'authenticated can read min version');

-- Seeded business-empire row is returned as anon.
set local role anon;
select is(
  (public.get_client_min_version('business-empire') ->> 'app'),
  'business-empire',
  'seeded app row round-trips as anon');
select is(
  (public.get_client_min_version('business-empire') ->> 'min_version'),
  '20260913a',
  'seeded min_version round-trips');
select is(
  (public.get_client_min_version('does-not-exist') ->> 'min_version'),
  null,
  'unknown app returns null min_version rather than throwing');
reset role;

select * from finish();
rollback;
