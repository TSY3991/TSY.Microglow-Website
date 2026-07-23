begin;

-- New cloud projects no longer auto-grant Data API access. Revoke first, then
-- grant only the operations intentionally reachable through publishable keys.
revoke all privileges on all tables in schema public from anon, authenticated;
revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage on schema public to anon, authenticated;
grant usage on schema private to authenticated;

alter table public.profiles enable row level security;
alter table public.user_settings enable row level security;
alter table public.friendships enable row level security;
alter table public.friend_invites enable row level security;
alter table public.notifications enable row level security;
alter table public.achievements enable row level security;
alter table public.user_achievements enable row level security;
alter table public.portal_apps enable row level security;
alter table public.portal_announcements enable row level security;
alter table public.portal_activity enable row level security;
alter table public.game_definitions enable row level security;
alter table public.game_maps enable row level security;
alter table public.game_map_tiles enable row level security;
alter table public.game_rooms enable row level security;
alter table public.room_members enable row level security;
alter table public.room_invites enable row level security;
alter table public.match_queue enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.match_events enable row level security;
alter table public.player_records enable row level security;
alter table public.business_empire_characters enable row level security;
alter table public.business_empire_asset_catalog enable row level security;
alter table public.business_empire_players enable row level security;
alter table public.business_empire_owned_assets enable row level security;
alter table public.radar_sources enable row level security;
alter table public.radar_products enable row level security;
alter table public.radar_source_products enable row level security;
alter table public.radar_prices enable row level security;
alter table public.radar_watchlists enable row level security;
alter table public.radar_alerts enable row level security;

create policy profiles_authenticated_read on public.profiles for select to authenticated
using (is_public or id = (select auth.uid()) or private.are_friends(id, (select auth.uid())));
create policy profiles_owner_update on public.profiles for update to authenticated
using (id = (select auth.uid())) with check (id = (select auth.uid()));
grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_path, is_public) on public.profiles to authenticated;

create policy user_settings_owner_all on public.user_settings for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.user_settings to authenticated;
grant update (locale, timezone, email_notifications, game_invites, radar_alerts, preferences) on public.user_settings to authenticated;

create policy friendships_participants_read on public.friendships for select to authenticated
using ((select auth.uid()) in (user_a, user_b));
grant select on public.friendships to authenticated;

create policy friend_invites_participants_read on public.friend_invites for select to authenticated
using ((select auth.uid()) in (sender_id, receiver_id));
grant select on public.friend_invites to authenticated;

create policy notifications_owner_read on public.notifications for select to authenticated
using (user_id = (select auth.uid()));
create policy notifications_owner_update on public.notifications for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

create policy achievements_public_read on public.achievements for select to anon, authenticated
using (is_active);
create policy achievements_admin_all on public.achievements for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.achievements to anon, authenticated;
grant insert, update, delete on public.achievements to authenticated;

create policy user_achievements_owner_read on public.user_achievements for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.user_achievements to authenticated;

create policy portal_apps_public_read on public.portal_apps for select to anon, authenticated
using (is_published);
create policy portal_apps_admin_all on public.portal_apps for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.portal_apps to anon, authenticated;
grant insert, update, delete on public.portal_apps to authenticated;

create policy portal_announcements_public_read on public.portal_announcements for select to anon, authenticated
using (is_published and published_at <= now() and (expires_at is null or expires_at > now()));
create policy portal_announcements_admin_all on public.portal_announcements for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.portal_announcements to anon, authenticated;
grant insert, update, delete on public.portal_announcements to authenticated;

create policy portal_activity_owner_read on public.portal_activity for select to authenticated
using (user_id = (select auth.uid()));
create policy portal_activity_owner_insert on public.portal_activity for insert to authenticated
with check (user_id = (select auth.uid()));
grant select, insert on public.portal_activity to authenticated;
grant usage, select on sequence public.portal_activity_id_seq to authenticated;

create policy game_definitions_public_read on public.game_definitions for select to anon, authenticated using (is_active);
create policy game_maps_public_read on public.game_maps for select to anon, authenticated using (is_active);
create policy game_map_tiles_public_read on public.game_map_tiles for select to anon, authenticated
using (exists (select 1 from public.game_maps gm where gm.id = map_id and gm.is_active));
grant select on public.game_definitions, public.game_maps, public.game_map_tiles to anon, authenticated;

create policy game_rooms_member_or_public_read on public.game_rooms for select to authenticated
using (private.is_room_member(id) or (visibility = 'public' and status in ('lobby', 'matching')));
grant select on public.game_rooms to authenticated;

create policy room_members_room_read on public.room_members for select to authenticated
using (private.is_room_member(room_id));
grant select on public.room_members to authenticated;

create policy room_invites_participants_read on public.room_invites for select to authenticated
using ((select auth.uid()) in (sender_id, receiver_id));
grant select on public.room_invites to authenticated;

create policy match_queue_owner_read on public.match_queue for select to authenticated
using (user_id = (select auth.uid()));
grant select on public.match_queue to authenticated;

create policy matches_players_read on public.matches for select to authenticated
using (private.is_match_player(id) or private.is_room_member(room_id));
grant select on public.matches to authenticated;

create policy match_players_match_read on public.match_players for select to authenticated
using (private.is_match_player(match_id));
grant select on public.match_players to authenticated;

create policy match_events_match_read on public.match_events for select to authenticated
using (private.is_match_player(match_id));
grant select on public.match_events to authenticated;

create policy player_records_public_profile_read on public.player_records for select to authenticated
using (user_id = (select auth.uid()) or exists (select 1 from public.profiles p where p.id = user_id and p.is_public));
grant select on public.player_records to authenticated;

create policy business_characters_public_read on public.business_empire_characters for select to anon, authenticated using (is_active);
create policy business_catalog_public_read on public.business_empire_asset_catalog for select to anon, authenticated using (is_active);
grant select on public.business_empire_characters, public.business_empire_asset_catalog to anon, authenticated;

create policy business_players_match_read on public.business_empire_players for select to authenticated
using (private.is_match_player(match_id));
create policy business_owned_match_read on public.business_empire_owned_assets for select to authenticated
using (private.is_match_player(match_id));
grant select on public.business_empire_players, public.business_empire_owned_assets to authenticated;

create policy radar_sources_public_read on public.radar_sources for select to anon, authenticated
using (status in ('active', 'degraded'));
create policy radar_sources_admin_all on public.radar_sources for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.radar_sources to anon, authenticated;
grant insert, update, delete on public.radar_sources to authenticated;

create policy radar_products_public_read on public.radar_products for select to anon, authenticated using (is_active);
create policy radar_products_admin_all on public.radar_products for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.radar_products to anon, authenticated;
grant insert, update, delete on public.radar_products to authenticated;

create policy radar_source_products_public_read on public.radar_source_products for select to anon, authenticated
using (is_active and exists (select 1 from public.radar_sources s where s.id = source_id and s.status in ('active', 'degraded')));
create policy radar_source_products_admin_all on public.radar_source_products for all to authenticated
using (private.is_admin()) with check (private.is_admin());
grant select on public.radar_source_products to anon, authenticated;
grant insert, update, delete on public.radar_source_products to authenticated;

create policy radar_prices_public_read on public.radar_prices for select to anon, authenticated using (true);
grant select on public.radar_prices to anon, authenticated;

create policy radar_watchlists_owner_all on public.radar_watchlists for all to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select, update, delete on public.radar_watchlists to authenticated;

create policy radar_alerts_owner_read on public.radar_alerts for select to authenticated
using (user_id = (select auth.uid()));
create policy radar_alerts_owner_update on public.radar_alerts for update to authenticated
using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
grant select on public.radar_alerts to authenticated;
grant update (status, read_at) on public.radar_alerts to authenticated;

-- Only explicitly exposed RPCs may mutate server-authoritative tables.
revoke all on function public.send_friend_invite(uuid, uuid) from public, anon, authenticated;
revoke all on function public.respond_friend_invite(uuid, boolean) from public, anon, authenticated;
revoke all on function public.create_game_room(text, text, public.room_visibility, smallint, uuid) from public, anon, authenticated;
revoke all on function public.join_game_room(text) from public, anon, authenticated;
revoke all on function public.set_room_ready(uuid, boolean, jsonb) from public, anon, authenticated;
revoke all on function public.invite_friend_to_room(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.enqueue_match(text, text, uuid) from public, anon, authenticated;
revoke all on function public.set_match_connection(uuid, boolean) from public, anon, authenticated;
revoke all on function public.start_game_match(uuid, uuid) from public, anon, authenticated;
revoke all on function public.business_empire_action(uuid, text, uuid, jsonb) from public, anon, authenticated;
revoke all on function public.create_radar_product(text, text, text, text, numeric, text, integer, uuid) from public, anon, authenticated;
revoke all on function public.record_radar_price(uuid, uuid, numeric, numeric, public.radar_price_kind, timestamptz, uuid, text, text, text, date, date) from public, anon, authenticated;
revoke all on function public.upsert_radar_watchlist(uuid, numeric) from public, anon, authenticated;

grant execute on function public.send_friend_invite(uuid, uuid) to authenticated;
grant execute on function public.respond_friend_invite(uuid, boolean) to authenticated;
grant execute on function public.create_game_room(text, text, public.room_visibility, smallint, uuid) to authenticated;
grant execute on function public.join_game_room(text) to authenticated;
grant execute on function public.set_room_ready(uuid, boolean, jsonb) to authenticated;
grant execute on function public.invite_friend_to_room(uuid, uuid, uuid) to authenticated;
grant execute on function public.enqueue_match(text, text, uuid) to authenticated;
grant execute on function public.set_match_connection(uuid, boolean) to authenticated;
grant execute on function public.start_game_match(uuid, uuid) to authenticated;
grant execute on function public.business_empire_action(uuid, text, uuid, jsonb) to authenticated;
grant execute on function public.create_radar_product(text, text, text, text, numeric, text, integer, uuid) to authenticated;
grant execute on function public.record_radar_price(uuid, uuid, numeric, numeric, public.radar_price_kind, timestamptz, uuid, text, text, text, date, date) to authenticated;
grant execute on function public.upsert_radar_watchlist(uuid, numeric) to authenticated;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.are_friends(uuid, uuid) to authenticated;
grant execute on function private.is_room_member(uuid, uuid) to authenticated;
grant execute on function private.is_match_player(uuid, uuid) to authenticated;

-- Public media buckets. Upload/delete rights remain scoped to the caller's UUID folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp']),
  ('radar-product-images', 'radar-product-images', true, 3145728, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy storage_public_media_read on storage.objects for select to anon, authenticated
using (bucket_id in ('avatars', 'radar-product-images'));
create policy storage_owner_upload on storage.objects for insert to authenticated
with check (bucket_id in ('avatars', 'radar-product-images') and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy storage_owner_update on storage.objects for update to authenticated
using (bucket_id in ('avatars', 'radar-product-images') and owner_id = (select auth.uid())::text)
with check (bucket_id in ('avatars', 'radar-product-images') and owner_id = (select auth.uid())::text);
create policy storage_owner_delete on storage.objects for delete to authenticated
using (bucket_id in ('avatars', 'radar-product-images') and owner_id = (select auth.uid())::text);

alter table public.notifications replica identity full;
alter table public.room_members replica identity full;
alter table public.matches replica identity full;
alter table public.match_events replica identity full;
alter table public.radar_alerts replica identity full;

do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications') then
    alter publication supabase_realtime add table public.notifications;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'room_members') then
    alter publication supabase_realtime add table public.room_members;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'matches') then
    alter publication supabase_realtime add table public.matches;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'match_events') then
    alter publication supabase_realtime add table public.match_events;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'radar_alerts') then
    alter publication supabase_realtime add table public.radar_alerts;
  end if;
end;
$$;

commit;
