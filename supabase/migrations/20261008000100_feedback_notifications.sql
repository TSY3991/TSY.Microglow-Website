begin;

-- Queue only new reports. Historical reports are not mailed automatically.
create table private.portal_feedback_notifications (
  feedback_id bigint primary key references private.portal_feedback(id) on delete cascade,
  state text not null default 'pending' check (state in ('pending', 'sending', 'sent', 'failed')),
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  lease_token uuid,
  sent_at timestamptz,
  last_error text
);
alter table private.portal_feedback_notifications enable row level security;
revoke all on private.portal_feedback_notifications from public, anon, authenticated;

create function private.queue_portal_feedback_notification()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into private.portal_feedback_notifications(feedback_id) values (new.id);
  return new;
end;
$$;
revoke all on function private.queue_portal_feedback_notification() from public, anon, authenticated;
create trigger queue_portal_feedback_notification
after insert on private.portal_feedback
for each row execute function private.queue_portal_feedback_notification();

-- Leases prevent concurrent workers from sending the same report.
create function public.claim_portal_feedback_notifications()
returns jsonb language plpgsql security definer set search_path = '' as $$
declare result jsonb;
begin
  update private.portal_feedback_notifications
  set state = 'failed', last_error = 'delivery_attempts_exhausted'
  where state in ('pending', 'sending') and attempts >= 5 and next_attempt_at <= now();
  with candidates as (
    select feedback_id from private.portal_feedback_notifications
    where state in ('pending', 'sending') and attempts < 5 and next_attempt_at <= now()
    order by feedback_id limit 3 for update skip locked
  ), claimed as (
    update private.portal_feedback_notifications q
    set state = 'sending', attempts = attempts + 1,
        next_attempt_at = now() + interval '5 minutes', lease_token = pg_catalog.gen_random_uuid()
    from candidates c where q.feedback_id = c.feedback_id
    returning q.feedback_id, q.lease_token
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id, 'created_at', f.created_at, 'page', f.page,
    'device', f.device, 'description', f.description, 'contact', f.contact,
    'lease_token', c.lease_token
  )), '[]'::jsonb) into result
  from claimed c join private.portal_feedback f on f.id = c.feedback_id;
  return result;
end;
$$;

create function public.finish_portal_feedback_notification(
  p_feedback_id bigint, p_lease_token uuid, p_success boolean, p_error text default null
)
returns boolean language plpgsql security definer set search_path = '' as $$
begin
  update private.portal_feedback_notifications
  set state = case when p_success then 'sent' when attempts >= 5 then 'failed' else 'pending' end,
      sent_at = case when p_success then now() else null end,
      next_attempt_at = now() + interval '5 minutes',
      last_error = case when p_success then null else left(p_error, 120) end,
      lease_token = null
  where feedback_id = p_feedback_id and lease_token = p_lease_token and state = 'sending';
  return found;
end;
$$;
revoke all on function public.claim_portal_feedback_notifications() from public, anon, authenticated;
revoke all on function public.finish_portal_feedback_notification(bigint, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.claim_portal_feedback_notifications() to service_role;
grant execute on function public.finish_portal_feedback_notification(bigint, uuid, boolean, text) to service_role;

commit;
