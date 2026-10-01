begin;

-- Portal bug/feedback intake without a GitHub account.
--   * private.portal_feedback   : raw submissions (never readable by clients)
--   * private.portal_known_issues : curated public status list, managed by the
--     owner via SQL; clients read it only through list_portal_known_issues().
-- Submissions go through a security-definer RPC with length caps, a duplicate
-- guard and a global hourly cap, since anonymous callers have no identity to
-- throttle on.

create table if not exists private.portal_feedback (
  id bigserial primary key,
  created_at timestamptz not null default now(),
  user_id uuid references auth.users(id) on delete set null,
  page text,
  device text,
  description text not null,
  contact text,
  user_agent text,
  status text not null default 'new'
    check (status in ('new', 'triaged', 'closed'))
);

create index if not exists portal_feedback_created_at_idx
  on private.portal_feedback (created_at desc);
create index if not exists portal_feedback_user_created_at_idx
  on private.portal_feedback (user_id, created_at desc)
  where user_id is not null;

create table if not exists private.portal_known_issues (
  id bigserial primary key,
  title text not null check (char_length(title) between 1 and 120),
  summary text check (summary is null or char_length(summary) <= 500),
  status text not null default 'reported'
    check (status in ('reported', 'investigating', 'fixed')),
  is_public boolean not null default true,
  reported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists portal_known_issues_public_idx
  on private.portal_known_issues (updated_at desc)
  where is_public = true;

create or replace function public.submit_portal_feedback(
  p_page text,
  p_device text,
  p_description text,
  p_contact text,
  p_user_agent text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_description text := btrim(coalesce(p_description, ''));
  v_page text := left(btrim(coalesce(p_page, '')), 200);
  v_device text := left(btrim(coalesce(p_device, '')), 200);
  v_contact text := nullif(left(btrim(coalesce(p_contact, '')), 200), '');
  v_ua text := left(coalesce(p_user_agent, ''), 300);
begin
  if char_length(v_description) < 5 then
    return jsonb_build_object('ok', false, 'error', 'description_too_short');
  end if;
  if char_length(v_description) > 2000 then
    return jsonb_build_object('ok', false, 'error', 'description_too_long');
  end if;

  if exists (
    select 1 from private.portal_feedback
    where description = v_description
      and created_at > now() - interval '1 hour'
  ) then
    return jsonb_build_object('ok', true, 'duplicate', true);
  end if;

  if (select count(*) from private.portal_feedback
        where created_at > now() - interval '1 hour') >= 40 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  if v_user_id is not null and (
    select count(*) from private.portal_feedback
      where user_id = v_user_id and created_at > now() - interval '1 hour'
  ) >= 5 then
    return jsonb_build_object('ok', false, 'error', 'rate_limited');
  end if;

  insert into private.portal_feedback
    (user_id, page, device, description, contact, user_agent)
  values
    (v_user_id, v_page, v_device, v_description, v_contact, v_ua);

  return jsonb_build_object('ok', true);
end;
$$;

revoke all on function public.submit_portal_feedback(text, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_portal_feedback(text, text, text, text, text)
  to anon, authenticated;

create or replace function public.list_portal_known_issues()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(jsonb_agg(to_jsonb(i) order by i.updated_at desc), '[]'::jsonb)
  from (
    select id, title, summary, status, reported_at, updated_at
    from private.portal_known_issues
    where is_public
    order by updated_at desc
    limit 30
  ) i;
$$;

revoke all on function public.list_portal_known_issues() from public, anon, authenticated;
grant execute on function public.list_portal_known_issues() to anon, authenticated;

commit;
