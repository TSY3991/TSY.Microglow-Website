begin;

-- 1. report_client_error: server-side volume caps. Client-side dedup is not a
--    defence against someone calling the RPC directly with the public key.
--    Over the cap we drop the sample silently so the client never retries.
create or replace function public.report_client_error(
  p_app text,
  p_message text,
  p_stack text,
  p_url text,
  p_user_agent text,
  p_context jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_app text := left(coalesce(p_app, ''), 64);
  v_message text := left(coalesce(nullif(p_message, ''), '(no message)'), 500);
  v_stack text := left(coalesce(p_stack, ''), 4000);
  v_url text := left(coalesce(p_url, ''), 500);
  v_ua text := left(coalesce(p_user_agent, ''), 300);
  v_context jsonb := coalesce(p_context, '{}'::jsonb);
begin
  if jsonb_typeof(v_context) <> 'object' then
    v_context := '{}'::jsonb;
  end if;
  if octet_length(v_context::text) > 2000 then
    v_context := jsonb_build_object('_truncated', true);
  end if;

  if (select count(*) from private.client_errors
        where created_at > now() - interval '1 hour') >= 500 then
    return;
  end if;
  if v_user_id is not null and (select count(*) from private.client_errors
        where user_id = v_user_id and created_at > now() - interval '1 hour') >= 30 then
    return;
  end if;

  insert into private.client_errors
    (user_id, app, url, user_agent, message, stack, context)
  values
    (v_user_id, v_app, v_url, v_ua, v_message, v_stack, v_context);
end;
$$;

-- 2. portal_activity is unused by every client; stop accepting writes.
drop policy if exists portal_activity_owner_insert on public.portal_activity;
revoke insert on public.portal_activity from authenticated;
revoke usage, select on sequence public.portal_activity_id_seq from authenticated;

-- 3. Public buckets keep serving objects by URL; stop anonymous listing.
drop policy if exists storage_public_media_read on storage.objects;
create policy storage_owner_read on storage.objects for select to authenticated
using (bucket_id in ('avatars', 'radar-product-images') and owner_id = (select auth.uid())::text);

-- 4. Defence in depth: RLS on every private table (no policies = deny to API
--    roles; security-definer owners are unaffected).
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'private' and not rowsecurity loop
    execute format('alter table private.%I enable row level security', r.tablename);
  end loop;
end $$;

commit;
