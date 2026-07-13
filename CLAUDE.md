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

## 延伸閱讀

- 備份工具的完整發版流程：見上方「備份工具原始碼」段落提到的本機專案資料夾裡的 `CLAUDE.md`
