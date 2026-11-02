begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(9);

select has_function('public', 'record_portal_visit', array['text'], 'record_portal_visit exists');
select is_definer('public', 'record_portal_visit', array['text'], 'record_portal_visit is security definer');
select ok(has_function_privilege('anon', 'public.record_portal_visit(text)', 'execute'),
  'anon can record a visit');

set local role anon;
select is(
  (public.record_portal_visit('bad') ->> 'error'),
  'invalid_key', 'malformed key rejected');
select is(
  (public.record_portal_visit('browser-key-0001') ->> 'total')::int,
  1, 'first visit counts');
select is(
  (public.record_portal_visit('browser-key-0001') ->> 'total')::int,
  1, 'same browser within 30 minutes is not counted again');
select is(
  (public.record_portal_visit('browser-key-0002') ->> 'total')::int,
  2, 'a different browser counts');
select throws_ok($$select * from private.portal_visit_total$$, '42501', null,
  'anon cannot read the raw counter table');
reset role;

update private.portal_visit_keys set last_counted_at = now() - interval '31 minutes'
where key_hash = md5('browser-key-0001');
set local role anon;
select is(
  (public.record_portal_visit('browser-key-0001') ->> 'total')::int,
  3, 'same browser counts again after 30 minutes');
reset role;

select * from finish();
rollback;
