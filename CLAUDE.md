# TSY.Microglow-Website - 專案維護手冊

給任何一個接手這個專案的 Claude Code session（包含未來的你）看的。這個檔案會在你於這個資料夾開新對話時自動載入，不需要使用者重新解釋背景。

## 這是什麼

TSY 微光創作室的主入口網站，靜態網頁，部署在 GitHub Pages（`https://tsy3991.github.io/TSY.Microglow-Website/`）。單頁式入口（`index.html`），左側導覽、頂部狀態列、最新消息、任務進度卡片、`#toolGrid` 工具卡片區（由 JS 資料驅動渲染）、手機版底部 dock。

## 三個關聯 repo（各自獨立部署，共用同一個 `tsy3991.github.io` origin）

| repo | 分支 | 用途 |
| --- | --- | --- |
| `TSY.Microglow-Website`（這裡） | `master` | 主入口網站 |
| `TSY.Microglow-Games` | `main` | 遊戲大廳，獨立 repo，深色霓虹風格 |
| `TSY.Microglow-Tools` | `main` | 工具箱，獨立 repo，淺色暖色調（跟主站同一套色票，不是 Games 那套） |

**分支名稱不一致**：這裡是 `master`，另外兩個是 `main`，push 前務必確認分支名稱。

三個 repo 因為同源（`tsy3991.github.io/<repo>/...`），瀏覽器 localStorage **會互通**——這是刻意設計，不是 bug，讓主站可以彙總測驗紀錄、遊戲紀錄來算 XP／等級。

備份工具（隨身硬碟同步備份工具）的原始碼**不在**這三個 repo 裡，放在使用者另一個獨立管理的本機專案資料夾（不屬於這三個 GitHub Pages repo，被該專案自己的 `.gitignore` 排除），該資料夾自己有 `CLAUDE.md` 跟完整發版檢查清單，路徑請向使用者確認。發行的二進位檔放在 `TSY3991/TSY.PortableBackupTool`（只放編譯好的檔案，不放原始碼），主站/工具箱的下載連結永遠指向 `/releases/latest`，發新版不用回頭改網站。

## 已知的坑

1. **`index.html` 本身沒辦法快取破壞**：GitHub Pages 對 HTML 檔設 `Cache-Control: max-age=600`（約 10 分鐘），純網址（無 query string）沒有繞過方法，push 後最多等 10 分鐘才會全面生效，這是正常現象不是部署失敗。
2. **其他資源要記得手動升版本號**：`styles.css`、`scripts/portal-records.js` 等用 `<link>`/`<script>` 引入的檔案有加 `?v=YYYYMMDDx` cache-busting，每次改了對應檔案要記得同步把版本號往後加一碼，不然使用者可能吃到舊快取。
3. **「最新消息」是手寫的，不會自動同步**：`index.html` 裡 `.news-list` 底下的 `<article class="news-item">` 都是手動加的靜態內容，工具箱／遊戲那邊發新版不會自動反映到這裡，需要手動加一則。已經評估過用 GitHub Actions webhook 做自動化的成本，目前發版頻率低，不划算，先維持手動（詳見 2026-07-13 對話紀錄）。
4. **`.back-link` CSS 陷阱**：`shared/base.css`（Games/Tools 都有各自一份）裡 `.back-link` 預設是首頁浮動徽章的樣式（`position:absolute; top:18px; left:18px;`），會被頁內導覽用的 `.back-link.compact-back` 繼承到不該有的定位。統一解法是 `.back-link:not(.compact-back)` 選擇器，只讓非 compact 版本套用絕對定位；新增頁面時如果又是浮動 hero 版型，記得幫 `.hero-copy` 之類的容器留 `padding-top` 讓文字不被蓋住。
5. **`preview_screenshot`/`computer` 工具偶爾 30 秒 timeout**，即使頁面很簡單。遇到就改用 `get_page_text`、`read_page`、`javascript_tool`、`read_console_messages`、`read_network_requests` 驗證，不要卡在重試截圖。
6. **Git-Bash 內嵌中文字 `grep`/`curl | grep` 可能悄悄比對失敗**（編碼問題），診斷網站內容時改成把輸出存檔、用 `node -e "fs.readFileSync(path,'utf8')"` 讀取比較可靠。

## 常用流程

- 本機預覽：`.claude/launch.json` 裡有 `portal-static-server`（port 8849，serve 這個 repo）跟 `games-static-server`（port 8848，serve `Games/` 子資料夾，這個資料夾被 `.gitignore` 排除、只在本機開發用）。要驗證 Tools repo 時，因為它是完全獨立的 repo（不在這個資料夾底下），習慣做法是在 scratchpad clone 一份、臨時在 `launch.json` 加一個 `tools-static-server` 條目、驗證完再移除，避免留下寫死的 scratchpad 路徑。
- 主站的 `tools[]` 資料陣列在 `scripts/portal-records.js`，是工具卡片渲染的唯一資料來源（`renderTool()`/`renderTools()`），新增工具卡片改這裡就好，不要手動寫 HTML。
- 發現「檢視／看看／評估」類需求時只分析回報，不要順手改；使用者明確說「修」才動手（使用者的全域規則，這個專案也適用）。
- push 前想清楚是不是該跟其他進行中的工作（例如另一個視窗/Codex 正在改的檔案）一起 bundle，不要各自零散 push，除非確認不衝突。

## 站內問題回報（2026-10 上線）

- 前端：`index.html` 的 `#feedback` 區塊 + `scripts/portal-feedback.js`，匿名可送，聯絡方式選填；不再導向 GitHub Issues（Issues 只留給擁有者自己用）。
- 後端：migration `20260722002000_portal_feedback.sql`。回報存 `private.portal_feedback`（前端無法直接讀寫），已知問題存 `private.portal_known_issues`；前端只能呼叫 `submit_portal_feedback`、`list_portal_known_issues` 兩個 RPC。
- 防濫用：描述 5–2000 字、其他欄位 200 字上限；同內容 1 小時內去重；全站每小時 40 筆、登入者每小時 5 筆；前端 honeypot + 同瀏覽器 60 秒冷卻。
- 看回報：Supabase SQL editor 或 `npx supabase db query --linked "select ... from private.portal_feedback order by created_at desc"`（本機沒有全域 `supabase` 指令，要用 `npx`）。
- 公開「已知問題與修復進度」：直接改 `private.portal_known_issues`（`status` 為 `reported`／`investigating`／`fixed`，`is_public=false` 可隱藏），不需重新部署網站。
- 測試資料請用 `[TEST]` 開頭，測完用 SQL 刪除，不要留在正式表。

## 資安強化（2026-10 檢視後）

- `supabase-js` 改為自行託管：`scripts/vendor/supabase-js-2.117.2.umd.js`（升版步驟見同資料夾 README.txt），三個頁面的 CSP `script-src` 已不再允許 jsDelivr；登入頁仍需 `challenges.cloudflare.com`（Turnstile）。
- CSP 補了 `base-uri`、`form-action`、`object-src`；`index.html`／`callback.html` 已移除 `style-src 'unsafe-inline'`（登入頁因 Turnstile 保留），新增內嵌 `style=` 屬性或 `<style>` 會被擋，改用 CSS class。
- `microglow-auth.js` 在 `/auth/` 頁被 iframe 嵌入時會隱藏並跳出（meta CSP 無法設 `frame-ancestors`）。
- migration `20260722002100_security_hardening.sql`：`report_client_error` 伺服器端限流（全站 500／小時、單一使用者 30／小時，超量靜默丟棄）、`portal_activity` 停止寫入、移除 storage 匿名列舉、`private` 全表啟用 RLS。
- 已刪除 `robots.txt`（子路徑下搜尋引擎不讀）；sitemap 請直接到 Google Search Console 提交。
- 線上人數 presence key 改為「每瀏覽器一個」；presence 本身無法防偽造，只影響顯示。

## 帳號安全與進度同步（2026-10-05）

- 密碼規則（2026-10-06 起）：至少 12 字元、最多 128，且需含英文大寫、小寫與特殊符號（不強制數字）。註冊／升級／重設時由 `scripts/password-policy.js` 檢查：本機常見弱密碼清單 + HIBP k-anonymity（只送 SHA-1 前 5 碼到 `api.pwnedpasswords.com`，查詢失敗不擋人）。登入不重驗強度，舊帳號仍可登入。`login.html`／`callback.html` 的 CSP `connect-src` 已加該網域。伺服器端 `minimum_password_length = 12` 在 `supabase/config.toml`；組合規則只在前端檢查（Supabase `password_requirements` 最低只有「大小寫＋數字」，無「不含數字」選項，故不設）。密碼欄位的眼睛按鈕由 `scripts/password-eye.js` 自動加到所有 `input[type=password]`；登入失敗 `Invalid login credentials` 會轉成中文並讓欄位紅框（`aria-invalid`）。
- 忘記密碼：`login.html` 的「忘記密碼？」→ `resetPasswordForEmail`（redirectTo = `auth/callback.html`，固定回應訊息不洩漏帳號是否存在）→ `auth-callback.js` 靠 `PASSWORD_RECOVERY` 事件顯示新密碼表單；帳號有 TOTP 時要求輸入驗證碼（updateUser 需 AAL2）。
- 兩步驟驗證（TOTP，選用）：登入頁已登入面板可啟用／停用；密碼登入後若 `nextLevel=aal2` 會顯示驗證碼表單。注意密碼通過後、驗證碼通過前 session 是 aal1，其他服務若要強制 MFA 需自行檢查 AAL。
- Email 驗證：遠端 `enable_confirmations=true`；`config.toml` 已與遠端對齊（SMTP、captcha 因含密鑰，**不宣告在 toml**，遠端值不受 push 影響）。**不要對真實 repo 跑 `config pull`**（讀不到 SMTP 密碼）；push 前先 `npx supabase config diff` 確認差異只有預期項目。
- 探索者經驗雲端同步：`scripts/portal-progress-sync.js`（只對非匿名會員）呼叫 RPC `sync_portal_progress`（migration `20261005000100_portal_progress.sql`，資料在 `private.portal_progress`）。本機與雲端取聯集／最大值，進度只增不減；只有載入入口網站時才同步（遊戲／工具頁單獨遊玩的紀錄，下次開入口網站才會上傳）。

## SEO 與分享預覽（2026-10-08 檢視後）

- 外部 SEO 掃描工具（如 open-seo-advisor-skill）對本站的「缺 sitemap.xml／robots.txt」是**誤報**：三個 repo 都是 `tsy3991.github.io/<repo>/` 子路徑專案站，搜尋引擎只讀網域根目錄的 robots.txt，子路徑下放了也無效。sitemap 請到 Google Search Console 提交。主站有 `sitemap.xml`（目前只含首頁）；Tools／Games 沒有，這是已知且可接受的。`login.html` 的 noindex 是刻意設計。
- Tools repo 的頁面（首頁與 `tools/*/index.html`）已補 og:*、twitter:card、canonical；OG 圖是 `assets/og-image.png`（1200x630，與主站同圖），網址 `https://tsy3991.github.io/TSY.Microglow-Tools/assets/og-image.png`。**新增工具頁時要照同一組 meta 補上**，canonical 用該頁完整網址。
- PriceRadar 頁是 React 殼（`<div id="root">`），meta 補丁只打在建置產物上，重新建置會被覆蓋，需在原始碼模板裡補。
- Games repo 的 7 個頁面已由 Codex 補上 og／canonical 與分享圖（`d1b4be2`，2026-10-10 線上驗證）；Games UI／版面工作一律走 Codex。
- 這類工具只借用檢查項目，不安裝進專案；掃描請在隔離環境跑、用完刪除。

## Claude／Codex 共用的更新流程

入口網站更新、新聞格式、工具上架、`?v=` 升版、工作樹有對方變更時如何只提交自己的差異、push 規則，統一寫在 `docs/update-workflow.md`（Codex 也讀這份）。動 `index.html` 或準備 push 前先讀；規則有變更只改那一份，這裡不重複。

## 延伸閱讀

- 備份工具的完整發版流程：見上方「備份工具原始碼」段落提到的本機專案資料夾裡的 `CLAUDE.md`
