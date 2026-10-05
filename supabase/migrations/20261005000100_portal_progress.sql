begin;

-- Explorer XP / progress cloud sync for signed-in (non-anonymous) members.
--   * private.portal_progress : one row per member, never readable by clients.
--   * public.sync_portal_progress(payload) : merges the client's local progress
--     into the stored row (union / max, so progress can only grow) and returns
--     the merged result. Anonymous (guest) users are rejected.
-- XP itself is computed on the client from this data (caps live in the UI);
-- the server only bounds sizes and counters.

create table if not exists private.portal_progress (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table private.portal_progress enable row level security;

create or replace function public.sync_portal_progress(p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_old jsonb;
  v_days jsonb;
  v_launches jsonb;
  v_sessions jsonb;
  v_games jsonb;
  v_result jsonb;
begin
  if v_user_id is null then
    return jsonb_build_object('ok', false, 'error', 'not_signed_in');
  end if;
  if coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    return jsonb_build_object('ok', false, 'error', 'guest_not_supported');
  end if;

  p_payload := coalesce(p_payload, '{}'::jsonb);
  if jsonb_typeof(p_payload) <> 'object' or length(p_payload::text) > 120000 then
    return jsonb_build_object('ok', false, 'error', 'bad_payload');
  end if;

  select data into v_old from private.portal_progress where user_id = v_user_id for update;
  v_old := coalesce(v_old, '{}'::jsonb);

  -- visitedDays: union of valid YYYY-MM-DD strings, newest 400
  select coalesce(jsonb_agg(d order by d), '[]'::jsonb) into v_days
  from (
    select d from (
      select distinct e as d
      from (
        select jsonb_array_elements_text(
          case when jsonb_typeof(v_old -> 'visitedDays') = 'array' then v_old -> 'visitedDays' else '[]'::jsonb end
        ) as e
        union all
        select jsonb_array_elements_text(
          case when jsonb_typeof(p_payload -> 'visitedDays') = 'array' then p_payload -> 'visitedDays' else '[]'::jsonb end
        )
      ) u
      where e ~ '^\d{4}-\d{2}-\d{2}$'
    ) x
    order by d desc
    limit 400
  ) t;

  -- launches: per-tool max, bounded keys and values
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_launches
  from (
    select k, max(v) as v
    from (
      select key as k, least(greatest((value)::numeric, 0), 100000)::bigint as v
      from jsonb_each(
        case when jsonb_typeof(v_old -> 'launches') = 'object' then v_old -> 'launches' else '{}'::jsonb end
      )
      where jsonb_typeof(value) = 'number' and char_length(key) <= 64
      union all
      select key, least(greatest((value)::numeric, 0), 100000)::bigint
      from jsonb_each(
        case when jsonb_typeof(p_payload -> 'launches') = 'object' then p_payload -> 'launches' else '{}'::jsonb end
      )
      where jsonb_typeof(value) = 'number' and char_length(key) <= 64
    ) l
    group by k
    order by max(v) desc
    limit 60
  ) m;

  -- quizSessions: union by (date, score, total), newest 300
  select coalesce(jsonb_agg(s order by s ->> 'date' desc), '[]'::jsonb) into v_sessions
  from (
    select distinct on (s ->> 'date', s ->> 'score', coalesce(s ->> 'total', s ->> 'answered')) s
    from (
      select e as s from jsonb_array_elements(
        case when jsonb_typeof(v_old -> 'quizSessions') = 'array' then v_old -> 'quizSessions' else '[]'::jsonb end
      ) e
      union all
      select e from jsonb_array_elements(
        case when jsonb_typeof(p_payload -> 'quizSessions') = 'array' then p_payload -> 'quizSessions' else '[]'::jsonb end
      ) e
    ) a
    where jsonb_typeof(s) = 'object'
      and length(s::text) <= 1000
      and (s ->> 'date') is not null
    order by s ->> 'date' desc
    limit 300
  ) q;

  -- games: per-game keep the entry with more plays (bestScore takes the max)
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb) into v_games
  from (
    select distinct on (k) k,
      jsonb_set(v, '{bestScore}', to_jsonb(best)) as v
    from (
      select key as k, value as v,
        coalesce((value ->> 'plays')::numeric, 0) as plays,
        max(coalesce((value ->> 'bestScore')::numeric, 0)) over (partition by key) as best
      from (
        select * from jsonb_each(
          case when jsonb_typeof(v_old -> 'games') = 'object' then v_old -> 'games' else '{}'::jsonb end
        )
        union all
        select * from jsonb_each(
          case when jsonb_typeof(p_payload -> 'games') = 'object' then p_payload -> 'games' else '{}'::jsonb end
        )
      ) g
      where jsonb_typeof(value) = 'object'
        and char_length(key) <= 64
        and (value ->> 'plays') ~ '^\d{1,6}$'
        and coalesce(value ->> 'bestScore', '0') ~ '^-?\d{1,12}(\.\d+)?$'
        and length(value::text) <= 500
    ) z
    order by k, plays desc
    limit 40
  ) w;

  v_result := jsonb_build_object(
    'visitedDays', v_days,
    'searches', least(greatest(coalesce((v_old ->> 'searches')::numeric, 0), coalesce((p_payload ->> 'searches')::numeric, 0), 0), 100000)::bigint,
    'filters', least(greatest(coalesce((v_old ->> 'filters')::numeric, 0), coalesce((p_payload ->> 'filters')::numeric, 0), 0), 100000)::bigint,
    'launches', v_launches,
    'quizSessions', v_sessions,
    'games', v_games
  );

  insert into private.portal_progress (user_id, data, updated_at)
  values (v_user_id, v_result, now())
  on conflict (user_id) do update set data = excluded.data, updated_at = now();

  return jsonb_build_object('ok', true, 'data', v_result);
end;
$$;

revoke all on function public.sync_portal_progress(jsonb) from public, anon, authenticated;
grant execute on function public.sync_portal_progress(jsonb) to authenticated;

commit;
