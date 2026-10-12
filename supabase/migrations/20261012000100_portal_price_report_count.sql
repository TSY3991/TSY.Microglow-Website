begin;

-- Explorer XP: count a signed-in member's Price Radar price reports.
-- Price Radar writes one public.portal_activity row per report through
-- price_radar.log_portal_activity (idempotent per report). This function only
-- reads that member's own rows and returns a number; XP value and cap live in
-- the client (scripts/portal-records.js), same as the other XP items.
-- Anonymous (guest) users get 0 and no row data is ever exposed.

create or replace function public.get_portal_price_report_count()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_count bigint;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('ok', true, 'count', 0);
  end if;

  select count(*) into v_count
  from public.portal_activity
  where user_id = v_user_id
    and app_key = 'price-radar'
    and activity_type in ('price_report', 'online_price_report');

  return jsonb_build_object('ok', true, 'count', least(v_count, 100000));
end;
$$;

revoke all on function public.get_portal_price_report_count() from public, anon, authenticated;
grant execute on function public.get_portal_price_report_count() to authenticated;

commit;
