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
- 新的放最上面（由新到舊）。已存在的新聞不刪、不改日期。
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

- 工具卡片只改 `scripts/portal-records.js` 的 `tools[]` 資料陣列，不要手寫 HTML。
- 改了 `portal-records.js`、`styles.css`、`support.css` 等有 `?v=` 的檔案，`index.html` 引用處的 `?v=YYYYMMDDx` 要同步往後加一碼。版本號以 `HEAD` 的實際值為準，改之前先看一眼，不要憑文件記憶。
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
