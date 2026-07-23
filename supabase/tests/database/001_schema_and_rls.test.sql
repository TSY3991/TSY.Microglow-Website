begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select plan(16);

select has_table('public','profiles','profiles exists');
select has_table('public','friend_invites','friend_invites exists');
select has_table('public','game_rooms','game_rooms exists');
select has_table('public','matches','matches exists');
select has_table('public','match_events','match_events exists');
select has_table('public','player_records','player_records exists');
select has_table('public','radar_sources','radar_sources exists');
select has_table('public','radar_products','radar_products exists');
select has_table('public','radar_prices','radar_prices exists');
select has_table('public','radar_watchlists','radar_watchlists exists');
select has_table('public','radar_alerts','radar_alerts exists');
select has_index('public','radar_prices','radar_prices_dedupe_idx','radar price dedupe index exists');
select has_index('public','friend_invites','friend_invites_one_pending_pair_idx','friend invite dedupe index exists');
select ok((select bool_and(c.relrowsecurity) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('profiles','user_settings','friendships','friend_invites','notifications','game_rooms','room_members','matches','match_players','match_events','radar_watchlists','radar_alerts')), 'private/user tables have RLS enabled');
select is_definer('public','business_empire_action',array['uuid','text','uuid','jsonb'],'business action is security definer');
select is_definer('public','record_radar_price',array['uuid','uuid','numeric','numeric','radar_price_kind','timestamp with time zone','uuid','text','text','text','date','date'],'radar price write is security definer');

select * from finish();
rollback;
