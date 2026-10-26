# 入口網站更新與新聞作業流程

給 Claude Code 與 Codex 共用。兩邊都會動到同一個 repo（尤其是 `index.html`），為了避免各自 push、互相覆蓋，動手前請先讀完這份。

> 規則有更新時只改這一份（`docs/update-workflow.md`），不要在別處另寫一套。專案 `CLAUDE.md` 只放指向這裡的短段落。

## 1. 分工

| 負責 | 內容 |
| --- | --- |
| Claude | 工具上架（Tools 卡片、主站新聞、`tools[]`）、`CLAUDE.md` 維護、Supabase 相關檢視 |
| Codex | UI／版面／圖像（含 Games 全部 UI 工作）、贊助頁、封面圖 |
| 共同 | `index.html`：兩邊都可能改，一律依第 2、5 點處理 |

未列出的項目，動手前先在回報中說明要改哪些檔案，由使用者確認歸屬。

## 2. 每次動手前

1. `git fetch`，確認本機 `master` 與 `origin/master` 的關係，並用 `git status` 看有沒有對方留下的未提交變更。
2. 工作樹有不是自己改的變更時：不要 `restore`／`checkout`、不要整檔覆蓋、不要 `git add .`。
3. 在回報中說明要改哪些檔案、哪幾段。
4. 只提交自己的差異（見第 5 點）。
5. 提交後再 `git fetch` 一次，確認沒有蓋掉對方的新 commit。

## 3. 新聞（`index.html`）規則

- 位置：`#newsList` 底下的 `<article class="news-item">`，全部手寫，不會自動同步。
- 新的放最上面（由新到舊）。**同一工具的版本新聞只保留最新 2 則**（使用者要求，2026-10-11 起）：為某工具新增一則後，刪除該工具第 3 則起的舊版本新聞；其他工具、遊戲、站務等新聞不受影響，保留的新聞不改日期。目前已套用的工具：PDF 工坊、隨身硬碟同步備份工具、媒體轉檔工具（含舊名「舊車機 MP3／MP4 轉檔工具」）、AI 圖片創作工具、PhotoConverter。
- 格式：

  ```html
  <article class="news-item">
    <time datetime="YYYY-MM-DD">MM/DD</time>
    <div>
      <strong><a class="news-link" href="完整網址">標題</a></strong>
      <p>一到兩句說明</p>
    </div>
  </article>
  ```

- 工具更新的標題用「<工具名> vX.Y.Z 更新」，連結指向該工具在 Tools 站的頁面；內文寫使用者看得懂的變化，不寫內部實作。
- 文案要簡短，精簡原則另見 [portal-support.md](portal-support.md)。

## 4. 工具上架／更新

- `scripts/portal-records.js` 的 `tools[]` 是入口欄位、分類與互動設定的資料來源；`index.html` 的 `#toolGrid` 同時保留對應靜態卡片，讓停用 JavaScript 的訪客與搜尋爬蟲仍能讀取入口。
- 新增或修改工具卡片時，同步更新 `tools[]` 與 HTML 卡片。`portal-records.js` 只增強既有卡片，不以 JS 重建卡片；完成後執行 `node scripts/check-portal-content.cjs`，核對兩處的 ID、分類、標題、關鍵字、描述、標籤、網址、按鈕與測驗欄位。
- 改了 `portal-records.js`、`styles.css`、`support.css` 等有 `?v=` 的檔案，`index.html` 引用處的 `?v=YYYYMMDDx` 要同步往後加一碼。版本號以 `HEAD` 的實際值為準，改之前先看一眼，不要憑文件記憶。
- Tools 各工具頁的 `download.js?v=`、`shared/*.css?v=` 等同樣要在內容變更時升版（2026-10-11 曾因改了 `download.js` 沒升 `?v=`，造成手機仍顯示舊的「發布於」）。**每次 push 前，檢查所有被修改的 js／css／圖片，其引用處的 `?v=` 是否已一起升。**
- Tools repo（`TSY3991/TSY.Microglow-Tools`，分支 `main`）：大廳卡片的 `data-updated-at` 是手動設定、用於排序，工具上新版時改成當天日期。各工具 `tools/<name>/download.js` 會抓 `releases/latest`，版本與日期是動態的，不用改。
- 工具發新版的動作：(a) 核對 icon 與介面快照（見下方「icon 與介面快照」）；(b) Tools 卡片 `data-updated-at`；(c) 主站新聞一則；(d) 確認主站 `tools[]` 是否需要更新。
- **順序**：先確認 Tools 的素材已發布且線上正常，再發布 Website 新聞。
- **日期語意（使用者要求，2026-10-10 起）**：「發布日期」＝該工具第一次公開 Release 的日期，「更新日期」＝目前版本的發布日期，兩者不可混用。Tools 下載頁顯示為「首次發布 YYYY/MM/DD · 本版更新 YYYY/MM/DD」（只有一個版本、或首發與最新同一天時只顯示「發布於」；取不到歷史清單時退回「最新版發布於」）。日期由 `download.js` 讀 GitHub Releases 動態計算，不手動維護。大廳卡片的 `data-updated-at` 是更新日期，只用於排序。

### icon 與介面快照（使用者要求，2026-10-10 起）

Tools 站的工具卡片與下載頁使用各工具正式 icon 和實際介面快照，素材在 Tools repo 的 `assets/tools/`，紀錄在 `assets/tools/manifest.json`，維護說明見 Tools 的 `docs/tool-visuals.md`／`.txt`。入口網站要發布某工具的最新消息時：

1. 核對正式發布版本的 icon 與介面，和 Tools 現有素材是否一致。
2. **有變更才更新素材**，並同步 `manifest.json`、快照版本標示、寬高尺寸。
3. 同網址的素材內容有變更時，同步升引用處的 `?v=`，避免吃到舊快取。
4. 介面沒變可沿用現有快照，但保留其實際版本標示（例如快照是 1.1.0，就維持標 1.1.0，不要改成最新版號假裝重拍）。
5. 素材不得包含私人檔案、路徑或帳號資訊。
6. 先確認 Tools 素材發布正常，再發布 Website 新聞。
### 品牌 LOGO 素材（2026-10-12 換新版，文字為「TSY.MICROGLOW STUDIO」）

- **圓形版**（四角透明）：瀏覽器分頁 icon（`assets/favicon.png`）、深色底的版面（登入頁 `logo-circle.webp`）、信件 LOGO（`email-logo-3.png`，檔名沿用，信件範本才不用重新部署）。
- **方形版**（不透明白底）：`apple-touch-icon.png`、PWA 的 `icon-192/512.png` 與 `icon-maskable-512.png`（maskable 內縮到 80% 安全區）。
- **例外：各工具自己的產品 icon 不換成微光 LOGO**。Price Radar 的 `tools/price-radar/icons/` 是使用者 2026-10-11 選定的「雷達＋價格標籤」icon A（原始碼在使用者另外管理的 Price Radar 專案資料夾內，路徑向使用者確認），換站台 LOGO 時不要動它（2026-10-12 曾誤換，已還原）。
- **透明去背版**（淺色底專用，已裁到內容範圍）：`logo-mark.png/.webp`、`logo-transparent.png`、`og-image.png` 內的 LOGO。
- 換 LOGO 時三個 repo（Website／Tools／Games）要一起換，所有引用處的 `?v=` 同步升版；OG 圖的網址也要加 `?v=`，社群平台才會重抓。

- 分支名稱：Website 是 `master`，Tools 與 Games 是 `main`。push 前務必確認。

## 5. 工作樹有對方變更時，只提交自己的差異

1. `git show HEAD:<檔案>` 取得 HEAD 版本，在其上套用自己的改動，存成暫存檔。
2. `git hash-object -w <暫存檔>` 取得 blob。
3. `git update-index --cacheinfo 100644,<blob>,<檔案路徑>`。
4. 確認 `git diff --cached` 只有自己的差異，再 commit。
5. 工作樹中對方的變更完全不動。

整檔 `git add` 只適用於「整份檔案都是自己的」。

## 6. push 規則

- push 前必須取得使用者的明確同意。
- 確認分支名稱，以及 `git log origin/<branch>..HEAD` 只有預期的 commit。
- 動到 `supabase/` 時，push 前先跑 `npx supabase config diff`，**絕不跑 `config pull`**。
- 這幾個 repo 是公開的：push 前檢查 diff，不要出現本機路徑、組織名、私人信箱或密鑰。
- 雙方都有工作要 push 時，先合併討論、一次處理，不要各自零散 push，除非確認檔案不衝突。

## 7. 部署與驗證

- GitHub Pages 對 HTML 設 `Cache-Control: max-age=600`，push 後最多約 10 分鐘才全面生效，是正常現象。
- 驗證用 `get_page_text`／`read_page`／網路請求，不要卡在截圖；在 Git-Bash 用 `curl | grep` 比對中文可能悄悄失敗，改為存檔後用 `node` 讀取。
- 檢查項目：新聞是否在最上面、`?v=` 是否為新值、Tools 卡片日期。

## 8. 工具發佈守則（2026-10-12 起，各工具視窗與 Codex 都要遵守）

起因：2026-10-12 檢視發現 .NET 發行檔內嵌本機建置路徑（PDB 路徑）。CarMedia、備份工具、PhotoConverter 已修並重發新版；PdfWorkshop 只修了原始碼（a292da9），尚未發新版，下次發版時帶上；以下為之後每次發佈都要守的規則。

### 8.1 發行檔不得洩漏本機資訊

- .NET 專案發佈設定：`DebugType=none`、`DebugSymbols=false`、`EnableSourceLink=false`、`DeterministicSourcePaths=true`、`PathMap=$(MSBuildProjectDirectory)=/_/`。Electron（MoneyFlow）：`electron-builder.yml` 的 `files` 用白名單，排除 `**/*.map`。
- **發佈前必掃**：對安裝檔、免安裝 zip、解開後的程式檔，搜尋 `C:\Users`、使用者名稱、專案資料夾名、磁碟代號路徑；`EnableCompressionInSingleFile` 的單檔要先解開 bundle 再掃。
- 第三方殘留（`D:\a\_work`、`D:\repos\empira`、`D:\a\PdfPig`、`D:\repos\xmp-core-dotnet` 等）無法移除，屬正常，不算洩漏。
- Release 說明與 CHANGELOG 用中性措辭，不提路徑、PDB、SourceLink；公開 repo 不得出現本機路徑、組織名、私人信箱、密鑰。

### 8.2 資產命名（Tools 站 `download.js` 依檔名分類）

- 安裝檔：副檔名 `.exe` 且檔名含 `setup`；免安裝：`.zip` 且檔名含 `portable`；ARM64 檔名含 `arm64`；雜湊檔檔名含 `sha256`。改命名前先確認 `classifyAsset()` 仍能辨識。

### 8.3 發佈流程與回報

1. commit／push／建立 Release 都要使用者在該工具視窗明確同意。
2. 發佈後用 `gh release view` 核對 tag、發佈時間、非 draft／非 prerelease、資產清單與 SHA256（與本機一致）。
3. **回報入口網站視窗**（Website session）：tag、Release 網址、資產與 SHA256、介面／icon 是否有變、一段**白話**差異說明（使用者看得懂，不寫內部實作）。
4. 工具視窗**不要自己改** Tools 與 Website 的卡片日期與最新消息，由 Website 視窗統一處理（順序：先 Tools，確認上線，再 Website 新聞；各自 push 前要使用者同意）。
5. 該工具的公開下載 repo README（若有版本號敘述）要同步更新。

### 8.4 檔案與驗證

- 含中文的 `.ps1` 用 UTF-8 **with BOM**（PowerShell 5.1 才不會解析失敗）、LF；其他設定檔、JSON、SKILL.md 用 UTF-8 無 BOM、LF。
- 修復後三段回歸：原功能正常、新防護擋得住、防護不誤擋；測試產生的暫存資料夾與 log 結束後清除並回報。
- 改檔前先備份到 `~/.claude/backups/<日期>/`。
