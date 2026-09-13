begin;

-- Client boot version gate. Each game boots, calls this RPC, and compares its
-- baked-in version string against min_version. When we ship a breaking client
-- change (schema-incompatible RPC payload, required cache-bust) we bump the
-- row here; the next boot on an old tab shows the "請重新整理" overlay instead
-- of silently sending broken requests. `notice` doubles as a maintenance
-- broadcast field.

create table if not exists private.client_versions (
  app text primary key,
  min_version text not null,
  notice text,
  updated_at timestamptz not null default now()
);

insert into private.client_versions (app, min_version, notice) values
  ('business-empire', '20260913a', null)
on conflict (app) do nothing;

create or replace function public.get_client_min_version(
  p_app text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
stable
as $$
declare
  v_row private.client_versions;
begin
  select * into v_row from private.client_versions where app = p_app;
  if not found then
    return jsonb_build_object('min_version', null, 'notice', null);
  end if;
  return jsonb_build_object(
    'app', v_row.app,
    'min_version', v_row.min_version,
    'notice', v_row.notice,
    'updated_at', v_row.updated_at
  );
end;
$$;

revoke all on function public.get_client_min_version(text) from public, anon, authenticated;
grant execute on function public.get_client_min_version(text) to anon, authenticated;

commit;
