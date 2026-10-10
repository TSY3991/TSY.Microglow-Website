-- Run only after deploying feedback-notify and configuring both secrets.
-- Store the function token in Vault as feedback_notify_token, and the HTTPS
-- function URL as feedback_notify_url. No Gmail password belongs in SQL/Vault.
begin;
create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function private.dispatch_feedback_notifications()
returns void language plpgsql security definer set search_path = '' as $$
declare v_url text; v_token text;
begin
  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'feedback_notify_url';
  select decrypted_secret into v_token from vault.decrypted_secrets where name = 'feedback_notify_token';
  if v_url is null or v_token is null then
    raise exception 'feedback_notification_secrets_missing';
  end if;
  if v_url !~ '^https://[a-z0-9]+\.supabase\.co/functions/v1/feedback-notify$' then
    raise exception 'invalid_feedback_notification_url';
  end if;
  if not exists (
    select 1 from private.portal_feedback_notifications
    where state in ('pending', 'sending') and next_attempt_at <= now()
  ) then return; end if;
  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-feedback-notify-token', v_token),
    body := '{}'::jsonb, timeout_milliseconds := 120000
  );
end;
$$;
revoke all on function private.dispatch_feedback_notifications() from public, anon, authenticated;
-- Validate the Vault entries before enabling the recurring job.
do $$
begin
  if not exists (select 1 from vault.decrypted_secrets where name = 'feedback_notify_token')
     or not exists (select 1 from vault.decrypted_secrets where name = 'feedback_notify_url') then
    raise exception 'feedback_notification_secrets_missing';
  end if;
end;
$$;
select cron.schedule('portal-feedback-email', '* * * * *', 'select private.dispatch_feedback_notifications();');
commit;
