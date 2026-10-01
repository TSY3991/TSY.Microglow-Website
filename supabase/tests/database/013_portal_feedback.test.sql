begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(11);

select has_function('public', 'submit_portal_feedback',
  array['text','text','text','text','text'], 'submit_portal_feedback exists');
select is_definer('public', 'submit_portal_feedback',
  array['text','text','text','text','text'], 'submit_portal_feedback is security definer');
select has_function('public', 'list_portal_known_issues', 'list_portal_known_issues exists');
select ok(has_function_privilege('anon',
  'public.submit_portal_feedback(text,text,text,text,text)', 'execute'),
  'anon can submit feedback');

set local role anon;
select is(
  (public.submit_portal_feedback('/', 'phone', 'ab', null, 'UA') ->> 'error'),
  'description_too_short', 'too-short description rejected');
select is(
  (public.submit_portal_feedback('/', 'phone', 'the button does nothing', 'me@example.com', 'UA') ->> 'ok'),
  'true', 'valid feedback accepted as anon');
select is(
  (public.submit_portal_feedback('/', 'phone', 'the button does nothing', null, 'UA') ->> 'duplicate'),
  'true', 'identical text within an hour is treated as duplicate');
select is(
  (public.submit_portal_feedback('/', 'phone', repeat('x', 2001), null, 'UA') ->> 'error'),
  'description_too_long', 'oversized description rejected');
reset role;

select is(
  (select count(*)::int from private.portal_feedback where description = 'the button does nothing'),
  1, 'duplicate did not create a second row');

insert into private.portal_known_issues (title, status, is_public) values
  ('public issue', 'investigating', true),
  ('hidden issue', 'reported', false);

set local role anon;
select is(
  jsonb_array_length(public.list_portal_known_issues()),
  1, 'anon sees only public known issues');
select throws_ok($$select * from private.portal_feedback$$, '42501', null,
  'anon cannot read raw feedback table');
reset role;

select * from finish();
rollback;
