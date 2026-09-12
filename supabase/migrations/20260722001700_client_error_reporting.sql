begin;

-- Client-side runtime errors (window.onerror / unhandledrejection) currently
-- vanish on the player's device. This RPC lets any caller — anon, guest, or
-- permanent — record a diagnostic sample so we can see failures we cannot
-- reproduce locally. Payload sizes are capped defensively; volume control is
-- handled client-side (dedup + per-session cap).

create table if not exists private.client_errors (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  app text,
  url text,
  user_agent text,
  message text not null,
  stack text,
  context jsonb not null default '{}'::jsonb
);

create index if not exists client_errors_created_at_idx
  on private.client_errors (created_at desc);
create index if not exists client_errors_app_created_at_idx
  on private.client_errors (app, created_at desc);
create index if not exists client_errors_user_created_at_idx
  on private.client_errors (user_id, created_at desc)
  where user_id is not null;

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
  -- Cap the JSON payload so a runaway client cannot dump megabytes per error.
  if octet_length(v_context::text) > 2000 then
    v_context := jsonb_build_object('_truncated', true);
  end if;

  insert into private.client_errors
    (user_id, app, url, user_agent, message, stack, context)
  values
    (v_user_id, v_app, v_url, v_ua, v_message, v_stack, v_context);
end;
$$;

revoke all on function public.report_client_error(text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.report_client_error(text, text, text, text, text, jsonb)
  to anon, authenticated;

commit;
