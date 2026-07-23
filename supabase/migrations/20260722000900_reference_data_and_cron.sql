create extension if not exists pg_cron;

begin;


insert into public.game_definitions (game_key, title, min_players, max_players, turn_seconds, rules)
values ('microglow-business-empire', '微光商業帝國', 2, 4, 45,
  jsonb_build_object('server_authoritative', true, 'win_condition', 'passive_income_covers_monthly_expense', 'elite_net_worth', 250000))
on conflict (game_key) do update set title = excluded.title, rules = excluded.rules, updated_at = now();

insert into public.game_maps (id, game_key, map_key, title, min_players, max_players, config)
values ('39910000-0000-4000-8000-000000000001', 'microglow-business-empire', 'double-ring-city',
  '雙環金融城', 2, 4, jsonb_build_object('zones', jsonb_build_object('basic', 32, 'elite', 20)))
on conflict (game_key, map_key) do update set title = excluded.title, config = excluded.config, updated_at = now();

insert into public.game_map_tiles (map_id, zone, position, tile_type, label, config) values
('39910000-0000-4000-8000-000000000001','basic',0,'gate','起點','{}'),
('39910000-0000-4000-8000-000000000001','basic',1,'income','星幣薪資','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',2,'stock','極光通訊','{}'),
('39910000-0000-4000-8000-000000000001','basic',3,'expense','裝備維修','{"amounts":[2400,1800,3600,2900]}'),
('39910000-0000-4000-8000-000000000001','basic',4,'learn','商學院','{}'),
('39910000-0000-4000-8000-000000000001','basic',5,'business','魔藥攤','{}'),
('39910000-0000-4000-8000-000000000001','basic',6,'income','商會分紅','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',7,'risk','飛艇故障','{"min_amount":2200,"max_amount":6200}'),
('39910000-0000-4000-8000-000000000001','basic',8,'real_estate','水晶套房','{}'),
('39910000-0000-4000-8000-000000000001','basic',9,'loan','微光銀行','{}'),
('39910000-0000-4000-8000-000000000001','basic',10,'income','專案獎金','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',11,'stock','飛龍科技','{}'),
('39910000-0000-4000-8000-000000000001','basic',12,'destiny','命運卡','{"amounts":[5200,-3600,4300,-2800]}'),
('39910000-0000-4000-8000-000000000001','basic',13,'expense','年度稅費','{"amounts":[2400,1800,3600,2900]}'),
('39910000-0000-4000-8000-000000000001','basic',14,'business','飛毯外送','{}'),
('39910000-0000-4000-8000-000000000001','basic',15,'learn','技能工坊','{}'),
('39910000-0000-4000-8000-000000000001','basic',16,'gate','精英之門','{}'),
('39910000-0000-4000-8000-000000000001','basic',17,'income','授權收入','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',18,'real_estate','符文店面','{}'),
('39910000-0000-4000-8000-000000000001','basic',19,'risk','市場震盪','{"min_amount":2200,"max_amount":6200}'),
('39910000-0000-4000-8000-000000000001','basic',20,'stock','能源基金','{}'),
('39910000-0000-4000-8000-000000000001','basic',21,'income','旺季獎金','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',22,'loan','王城銀行','{}'),
('39910000-0000-4000-8000-000000000001','basic',23,'expense','設備汰換','{"amounts":[2400,1800,3600,2900]}'),
('39910000-0000-4000-8000-000000000001','basic',24,'business','直播工坊','{}'),
('39910000-0000-4000-8000-000000000001','basic',25,'destiny','機遇卡','{"amounts":[5200,-3600,4300,-2800]}'),
('39910000-0000-4000-8000-000000000001','basic',26,'income','額外收入','{"amounts":[5200,3800,4600,2800]}'),
('39910000-0000-4000-8000-000000000001','basic',27,'learn','投資講堂','{}'),
('39910000-0000-4000-8000-000000000001','basic',28,'real_estate','浮空倉庫','{}'),
('39910000-0000-4000-8000-000000000001','basic',29,'risk','魔力風暴','{"min_amount":2200,"max_amount":6200}'),
('39910000-0000-4000-8000-000000000001','basic',30,'stock','星界通訊','{}'),
('39910000-0000-4000-8000-000000000001','basic',31,'expense','旅費支出','{"amounts":[2400,1800,3600,2900]}'),
('39910000-0000-4000-8000-000000000001','elite',0,'gate','王者之門','{}'),
('39910000-0000-4000-8000-000000000001','elite',1,'stock','鳳凰控股','{}'),
('39910000-0000-4000-8000-000000000001','elite',2,'risk','巨龍風險','{"min_amount":7000,"max_amount":15000}'),
('39910000-0000-4000-8000-000000000001','elite',3,'real_estate','雲端商塔','{}'),
('39910000-0000-4000-8000-000000000001','elite',4,'income','帝國分紅','{"amounts":[11000,7200,9000,6500]}'),
('39910000-0000-4000-8000-000000000001','elite',5,'business','傳送門網','{}'),
('39910000-0000-4000-8000-000000000001','elite',6,'destiny','皇室命運','{"amounts":[11000,-8500,7200,-6200]}'),
('39910000-0000-4000-8000-000000000001','elite',7,'expense','併購支出','{"amounts":[8500,6200,7400,9100]}'),
('39910000-0000-4000-8000-000000000001','elite',8,'learn','王者學院','{}'),
('39910000-0000-4000-8000-000000000001','elite',9,'stock','星界能源','{}'),
('39910000-0000-4000-8000-000000000001','elite',10,'gate','終局之門','{}'),
('39910000-0000-4000-8000-000000000001','elite',11,'real_estate','龍港物流','{}'),
('39910000-0000-4000-8000-000000000001','elite',12,'risk','黑曜危機','{"min_amount":7000,"max_amount":15000}'),
('39910000-0000-4000-8000-000000000001','elite',13,'business','魔像工坊','{}'),
('39910000-0000-4000-8000-000000000001','elite',14,'income','王城收益','{"amounts":[11000,7200,9000,6500]}'),
('39910000-0000-4000-8000-000000000001','elite',15,'loan','帝國銀行','{}'),
('39910000-0000-4000-8000-000000000001','elite',16,'destiny','星辰命運','{"amounts":[11000,-8500,7200,-6200]}'),
('39910000-0000-4000-8000-000000000001','elite',17,'stock','商會控股','{}'),
('39910000-0000-4000-8000-000000000001','elite',18,'expense','擴張成本','{"amounts":[8500,6200,7400,9100]}'),
('39910000-0000-4000-8000-000000000001','elite',19,'learn','領袖研習','{}')
on conflict (map_id, zone, position) do update set tile_type = excluded.tile_type, label = excluded.label, config = excluded.config;

insert into public.business_empire_characters
(character_key, name, starting_cash, salary, base_expense, starting_skill) values
('starlight-merchant','星輝商旅',36000,4800,3000,0),
('rune-artisan','符文工匠',28000,5000,2900,2),
('moon-investor','月影投資家',30000,4500,2550,1)
on conflict (character_key) do update set name=excluded.name, starting_cash=excluded.starting_cash,
 salary=excluded.salary, base_expense=excluded.base_expense, starting_skill=excluded.starting_skill;

insert into public.business_empire_asset_catalog
(asset_key,zone,asset_type,name,purchase_price,asset_value,loan_principal,monthly_income,monthly_cost,risk_level) values
('aurora-stock','basic','stock','極光通訊股',9000,9000,0,420,0,'medium'),
('mana-fund','basic','stock','魔力指數基金',14000,14000,0,580,0,'low'),
('drake-tech','basic','stock','飛龍科技股',18000,18000,0,880,0,'high'),
('lantern-studio','basic','real_estate','燈塔出租套房',15000,60000,45000,1400,470,'low'),
('rune-shop','basic','real_estate','符文商店店面',23000,88000,65000,2100,720,'medium'),
('sky-warehouse','basic','real_estate','浮空倉庫',28000,108000,80000,2700,930,'medium'),
('potion-cart','basic','business','星露飲品攤',8000,8000,0,650,120,'low'),
('delivery-guild','basic','business','飛毯外送隊',13500,13500,0,1100,240,'medium'),
('crystal-stream','basic','business','水晶直播坊',18000,18000,0,1550,380,'high'),
('phoenix-holdings','elite','stock','鳳凰控股',52000,52000,0,3500,0,'high'),
('astral-bond','elite','stock','星界能源債',68000,68000,0,3900,0,'medium'),
('cloud-tower','elite','real_estate','雲端商務塔',60000,260000,200000,9200,3200,'medium'),
('dragon-harbor','elite','real_estate','龍港物流園',82000,350000,268000,13800,4900,'high'),
('portal-network','elite','business','傳送門連鎖網',48000,48000,0,4800,1100,'medium'),
('golem-factory','elite','business','魔像自動工坊',75000,75000,0,7900,1900,'high')
on conflict (asset_key) do update set purchase_price=excluded.purchase_price, asset_value=excluded.asset_value,
 loan_principal=excluded.loan_principal, monthly_income=excluded.monthly_income, monthly_cost=excluded.monthly_cost;

insert into public.portal_apps (app_key,title,description,url,category,sort_order,is_published) values
('portal','TSY 微光創作室','工具、測驗與作品的共用入口','https://tsy3991.github.io/TSY.Microglow-Website/','portal',1,true),
('games','微光遊戲大廳','TSY.Microglow 遊戲入口','https://tsy3991.github.io/TSY.Microglow-Games/','game',2,true),
('tools','微光工具箱','TSY.Microglow 實用工具','https://tsy3991.github.io/TSY.Microglow-Tools/','utility',3,true)
on conflict (app_key) do update set title=excluded.title, description=excluded.description, url=excluded.url,
 category=excluded.category, sort_order=excluded.sort_order, is_published=excluded.is_published;

insert into public.achievements (achievement_key,module,title,description,points,criteria) values
('first-login','platform','初見微光','首次登入共用平台',10,'{"event":"first_login"}'),
('first-friend','social','微光相遇','加入第一位好友',20,'{"friend_count":1}'),
('first-match','games','初次對局','完成第一場遊戲對局',20,'{"matches_played":1}'),
('radar-first-watch','radar','價格守望','追蹤第一項商品',10,'{"watch_count":1}')
on conflict (achievement_key) do update set title=excluded.title, description=excluded.description, points=excluded.points, criteria=excluded.criteria;

insert into public.radar_sources (source_key,name,kind,status) values
('pxmart','全聯福利中心','store','active'),('carrefour','家樂福','store','active'),
('rt-mart','大潤發','store','active'),('a-mart','愛買','store','active'),('costco','好市多 Costco','store','active'),
('showba','小北百貨','store','active'),('poya','寶雅','store','active'),('simple-mart','美廉社','store','active'),
('funcom','楓康超市','store','active'),('elha','喜互惠超市','store','active'),('7-eleven','7-11','store','active'),
('familymart','全家 FamilyMart','store','active'),('ok-mart','OK mart','store','active'),('hilife','萊爾富','store','active'),
('watsons','屈臣氏','store','active'),('cosmed','康是美','store','active'),('great-tree','大樹藥局','store','active'),
('local-market','在地市場使用者回報','manual','active')
on conflict (source_key) do update set name=excluded.name, kind=excluded.kind, status=excluded.status, updated_at=now();

select cron.unschedule(jobid)
from cron.job
where jobname in ('microglow-matchmaking', 'microglow-expire-stale-state');

select cron.schedule('microglow-matchmaking', '* * * * *', 'select private.run_matchmaking_once();');
select cron.schedule('microglow-expire-stale-state', '* * * * *', 'select private.expire_stale_game_state();');

commit;
