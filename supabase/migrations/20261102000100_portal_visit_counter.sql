begin;

-- Cumulative popularity ("累積人氣") for the portal home page.
-- A "visit" is one browser opening the portal. The browser sends its random
-- per-browser key (same one used by the online-count presence channel); the
-- server counts it at most once per 30 minutes, so reloads and extra tabs do
-- not inflate the total. Keys are stored only as md5 hashes and pruned after
-- two days. A global hourly cap silently drops abuse beyond the cap while still
-- returning the current total. Callable by anonymous visitors; tables are
-- private and unreachable from the client.

create table if not exists private.portal_visit_total (
  id smallint primary key check (id = 1),
  total bigint not null default 0 check (total >= 0),
  updated_at timestamptz not null default now()
);

insert into private.portal_visit_total (id, total)
values (1, 0)
on conflict (id) do nothing;

create table if not exists private.portal_visit_keys (
  key_hash text primary key,
  last_counted_at timestamptz not null default now()
);

create index if not exists portal_visit_keys_last_counted_idx
  on private.portal_visit_keys (last_counted_at);

create table if not exists private.portal_visit_hourly (
  hour_start timestamptz primary key,
  counted integer not null default 0
);

alter table private.portal_visit_total enable row level security;
alter table private.portal_visit_keys enable row level security;
alter table private.portal_visit_hourly enable row level security;

create or replace function public.record_portal_visit(p_key text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $$
declare
  c_window constant interval := interval '30 minutes';
  c_hourly_cap constant integer := 3000;
  v_hash text;
  v_hour timestamptz := date_trunc('hour', now());
  v_last timestamptz;
  v_hour_count integer;
  v_total bigint;
begin
  if p_key is null or p_key !~ '^[A-Za-z0-9_-]{8,64}$' then
    select total into v_total from private.portal_visit_total where id = 1;
    return jsonb_build_object('ok', false, 'error', 'invalid_key', 'total', v_total);
  end if;

  v_hash := md5(p_key);

  -- Serialise counting so two simultaneous calls cannot both pass the check.
  perform 1 from private.portal_visit_total where id = 1 for update;

  select last_counted_at into v_last
  from private.portal_visit_keys
  where key_hash = v_hash;

  if v_last is null or v_last <= now() - c_window then
    select counted into v_hour_count
    from private.portal_visit_hourly
    where hour_start = v_hour;

    if coalesce(v_hour_count, 0) < c_hourly_cap then
      insert into private.portal_visit_hourly (hour_start, counted)
      values (v_hour, 1)
      on conflict (hour_start) do update set counted = private.portal_visit_hourly.counted + 1;

      insert into private.portal_visit_keys (key_hash, last_counted_at)
      values (v_hash, now())
      on conflict (key_hash) do update set last_counted_at = excluded.last_counted_at;

      update private.portal_visit_total
      set total = total + 1, updated_at = now()
      where id = 1;
    end if;
  end if;

  -- Housekeeping: keep the dedupe tables small.
  delete from private.portal_visit_keys where last_counted_at < now() - interval '2 days';
  delete from private.portal_visit_hourly where hour_start < now() - interval '2 days';

  select total into v_total from private.portal_visit_total where id = 1;
  return jsonb_build_object('ok', true, 'total', v_total);
end;
$$;

revoke all on function public.record_portal_visit(text) from public, anon, authenticated;
grant execute on function public.record_portal_visit(text) to anon, authenticated;

commit;
