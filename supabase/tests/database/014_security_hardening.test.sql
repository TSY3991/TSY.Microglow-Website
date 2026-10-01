begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(5);

select is((select count(*)::int from pg_tables where schemaname='private' and not rowsecurity), 0,
  'every private table has RLS enabled');
select ok(not has_table_privilege('authenticated','public.portal_activity','insert'),
  'authenticated cannot insert portal_activity');
select is((select count(*)::int from pg_policies where schemaname='storage' and tablename='objects'
  and policyname='storage_public_media_read'), 0, 'anonymous bucket listing policy removed');

-- Global cap: 500 rows in the last hour => further anon samples are dropped.
insert into private.client_errors (app, message)
select 'cap-test', 'm' from generate_series(1, 500);
set local role anon;
select public.report_client_error('cap-test-extra','over cap',null,null,null,'{}'::jsonb);
reset role;
select is((select count(*)::int from private.client_errors where app='cap-test-extra'), 0,
  'over the global hourly cap the sample is dropped');

delete from private.client_errors where app='cap-test';
set local role anon;
select public.report_client_error('cap-test-extra','under cap',null,null,null,'{}'::jsonb);
reset role;
select is((select count(*)::int from private.client_errors where app='cap-test-extra'), 1,
  'under the cap the sample is stored');

select * from finish();
rollback;
