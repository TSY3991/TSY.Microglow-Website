# microglow-platform Supabase 設定指南

## 結論與邊界

共用後端的 migration Source of Truth 位於入口網站 repo 的 `supabase/`。入口網站、Games 與價格雷達前端維持既有靜態或獨立部署，不搬到 Supabase Storage。

Supabase Region 是雲端 Project 建立時決定的部署區域；本機 Docker 不會建立或改變 Region。Docker 只用於本機 Supabase stack、migration 重建、pgTAP 與 database lint。

截至 2026-07-22，尚未執行 `supabase login`、`supabase link`、遠端 `db push`、Edge Functions 部署、Git commit 或 push。

## Project Ref

在 Supabase Dashboard 開啟 `microglow-platform`：

`Settings → General → Project Settings → Reference ID`

Project Ref 可以提供；請勿把 database password、secret key、legacy service-role key、personal access token 或 OAuth provider secret 貼進對話、HTML、JavaScript 或 Git。

## 本機設定與驗證

Windows 保留了預設的 54300–54499 port，因此本機改用：

- API：`http://127.0.0.1:55221`
- PostgreSQL：`127.0.0.1:55222`
- Studio：`http://127.0.0.1:55223`
- Mailpit：`http://127.0.0.1:55224`
- Shadow DB：`55220`

本機 Analytics 已關閉，避免在 Windows 開放無 TLS 的 Docker daemon 2375。這不影響 Auth、PostgreSQL、Realtime、Edge Runtime、Storage、Cron、RLS，也不影響雲端 Project。

驗證命令：

```powershell
npx.cmd -y supabase@2.109.1 --workdir . start
npx.cmd -y supabase@2.109.1 --workdir . db reset --local
npx.cmd -y supabase@2.109.1 --workdir . test db
npx.cmd -y supabase@2.109.1 --workdir . db lint --local --level warning
```

2026-07-22 實測結果：

- 9 個 migrations 從空資料庫完整重建：PASS
- pgTAP：27／27 PASS
- Database lint：零錯誤、零警告
- 31／31 個 public 資料表啟用 RLS
- Auth health endpoint：HTTP 200
- DB、Auth、Storage、Realtime、Studio、Kong：healthy

## Migration 順序

1. `extensions_shared_portal`：extensions、共用會員、入口網站。
2. `game_core`：遊戲、地圖、房間、配對、戰績與事件。
3. `business_empire`：商業帝國伺服器狀態。
4. `price_radar`：來源商品正規化、價格、追蹤與通知。
5. `core_functions`：Auth trigger、好友、房間與配對 RPC。
6. `match_and_business_functions`：伺服器骰子、回合、交易與勝負。
7. `radar_matchmaking_functions`：價格寫入、提醒、配對與逾期清理。
8. `rls_grants_storage_realtime`：RLS、explicit GRANT、Storage、Realtime。
9. `reference_data_and_cron`：地圖、角色、資產、商店與 Cron。

## 遠端部署前預覽

確認 Project 名稱、亞太 Region、Data API Enabled、Automatically expose new tables Disabled；若 Dashboard 提供 RLS-by-default，應啟用。

登入使用官方瀏覽器授權，密碼只在本機 CLI 互動輸入：

```powershell
npx.cmd -y supabase@2.109.1 login
npx.cmd -y supabase@2.109.1 projects list
npx.cmd -y supabase@2.109.1 link --project-ref <PROJECT_REF>
npx.cmd -y supabase@2.109.1 migration list --linked
npx.cmd -y supabase@2.109.1 db push --dry-run
```

Dry-run 完成後必須停止並取得「允許遠端部署」才可執行 `db push`。禁止使用 `db reset --linked` 或 `db push --include-seed`。遠端失敗時以新的 corrective migration 修正，不重置遠端、不手動刪表掩蓋錯誤。

## Auth 與跨網站登入

- Site URL：`https://tsy3991.github.io/TSY.Microglow-Website/`
- Portal callback：`https://tsy3991.github.io/TSY.Microglow-Website/auth/callback.html`
- Games callback：`https://tsy3991.github.io/TSY.Microglow-Games/auth/callback.html`
- Portal local：`localhost/127.0.0.1:8849`
- Games local：`localhost/127.0.0.1:8848`
- Price Radar local：`localhost/127.0.0.1:5180`

價格雷達正式網址尚未確認，不可猜測或加入正式 redirect。不同網域不會天然共用瀏覽器 session；由入口網站擔任中央登入入口，各網站用精確 callback 建立自己的 session。

瀏覽器只能取得 Project URL 與 publishable key。入口網站 CSP 應精確加入 `https://<PROJECT_REF>.supabase.co` 與 `wss://<PROJECT_REF>.supabase.co`，不可使用 `*`。

## Edge Functions 與價格收集

第一階段沒有需要部署的 Edge Function。價格雷達目前沒有確認的正式商品 API，因此不建立空函式。

若未來使用正式 API，可採 `Cron → Edge Function → 商品 API → PostgreSQL`；API key 只放 Edge Function Secrets。Playwright、Chrome、CAPTCHA 或長時間爬蟲改用外部收集器，不放 Supabase Edge Functions，也不規避網站保護。
