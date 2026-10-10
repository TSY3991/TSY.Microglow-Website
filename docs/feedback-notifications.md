# Bug 回報自動通知（2026-10-08）

## 行為與通知草稿

使用者仍按「送出回報」，不開啟郵件程式。回報存進 `private.portal_feedback` 後，由 trigger 建立通知佇列；每分鐘排程呼叫後端，將新回報寄至由 `FEEDBACK_NOTIFY_RECIPIENT` secret 指定的官方 Gmail。本次準備使用同一個 Gmail 的 SMTP／TLS 465 寄信，需帳號應用程式密碼。未寄信時回報仍保留在資料庫。

郵件主旨：`[微光 Bug 回報 #123] 首頁搜尋`

郵件內文包含：編號、時間、頁面／功能、裝置、問題描述、使用者選填聯絡方式。郵件固定寄給創作者，不寄給回報者；內容使用純文字，不執行使用者輸入的 HTML，也不以使用者聯絡方式更改寄件人／收件人。

## 檔案

- `supabase/migrations/20261008000100_feedback_notifications.sql`：私有佇列、trigger、service-role 限定 RPC。
- `supabase/functions/feedback-notify/`：SMTP 寄信與權杖驗證。
- `supabase/feedback-notification-schedule.sql`：經確認後手動啟用，每分鐘檢查待寄佇列。
- `scripts/check-feedback-notifications.mjs`：隔離 PostgreSQL 驗證，絕不連正式資料庫。

## 使用者需完成的帳號設定

1. 用 `FEEDBACK_NOTIFY_RECIPIENT` secret 指定的官方 Gmail 登入 Google，啟用兩步驟驗證。
2. 在 https://myaccount.google.com/apppasswords 建立「微光 Bug 通知」應用程式密碼。
3. 在正確的 Supabase 專案（目前本機 linked ref：`xduwufkfmzovlwcyodcp`）的 Edge Functions Secrets 加入 `FEEDBACK_GMAIL_APP_PASSWORD`，值為該應用程式密碼（去除顯示分組空格）。不要貼到聊天、前端或 Git。
4. 由使用者自行設定函式 secret `FEEDBACK_NOTIFY_RECIPIENT`，值為官方 Gmail 完整信箱。這是遠端設定值，不是程式碼變更；此帳號同時用於 SMTP 登入、寄件人與收件人，只在 Supabase Secrets 設定，不寫入程式、文件或 Git。未設定或格式不合時回應 503，且不領取通知佇列，不會退回預設信箱。

這是後端寄信設定，與 Supabase Auth 的登入／註冊 SMTP 設定不同。

## 部署與啟用順序

2026-10-08：通知 migration、feedback-notify 與每分鐘排程已部署。SMTP 已接受編號 #2 的測試通知，佇列狀態為 sent、嘗試 1 次；Gmail 收件匣仍待使用者確認。前端玻璃按鈕與公告精簡尚未 push。

2026-10-10：經使用者確認，已設定 FEEDBACK_NOTIFY_RECIPIENT 並部署新版 feedback-notify（ACTIVE v4）。線上未帶 token 的 POST 回應 401、GET 回應 405；既有每分鐘排程保持啟用。未重跑 migration 或排程 SQL，也未另寄測試信，本次 SMTP 寄送與收件匣尚未重新驗證。B 批已 commit、尚未 push。

下列為部署時的操作順序與限制，供維護參考；不需再次執行。

本次 B 批整理僅調整本機測試與文件，不重新部署、設定遠端 secret、套用 migration 或 push。上方 2026-10-10 部署資訊是先前操作紀錄，不代表本次再次部署；其他環境的收件人 secret 由使用者自行設定。

1. 在既有專案的 Edge Functions Secrets 設定 `FEEDBACK_NOTIFY_RECIPIENT`，值為目前通知使用的官方 Gmail；保留既有 `FEEDBACK_NOTIFY_TOKEN` 與 `FEEDBACK_GMAIL_APP_PASSWORD`，不要輸出值。
2. 另行取得部署確認後，只部署新版 `feedback-notify`，不要重跑 migration、排程 SQL 或 `config pull`，也不要改 SMTP／captcha 設定。
3. `verify_jwt = false` 必須搭配函式的 `x-feedback-notify-token` 檢查；非 POST 回應 405、未設定 token 回應 503、token 不符回應 401、收件設定缺失或格式不合回應 503。
4. 經確認後用明確標示 `[TEST]` 的假資料驗證通知並清理測試資料；HTTP 200 或 SMTP 接受不代表實際收件。

## 重試與管理

- 一次最多取 3 則；租約 5 分鐘，使用 `FOR UPDATE SKIP LOCKED` 排除已租用項目。
- 最多嘗試 5 次，失敗間隔 5 分鐘；租約逾時可重取。只記通用錯誤，不存寄信服務敏感錯誤。
- 同內容重複回報沿用既有去重邏輯，不新增通知；啟用前的舊回報不補寄。
- SMTP 不保證 exactly-once：若寄出後程序中斷、尚未確認資料庫，重試可能寄出第二封。通知主旨含固定回報編號，可辨認同一回報。
- 可用以下查詢查看通知狀態：

```sql
select feedback_id, state, attempts, sent_at, last_error
from private.portal_feedback_notifications
order by feedback_id desc limit 50;
```

停用排程：`select cron.unschedule('portal-feedback-email');`。保留表單回報與佇列，勿刪除真實回報。

## 本機驗證

`node --test supabase/functions/feedback-notify/core.test.mjs`

`npx --yes deno check supabase/functions/feedback-notify/index.ts`

PostgreSQL 驗證：在暫存資料夾安裝 `@electric-sql/pglite`，將 `FEEDBACK_TEST_RUNTIME` 設為該資料夾，再執行 `node scripts/check-feedback-notifications.mjs`。此測試使用記憶體資料庫，確認原回報 RPC、去重、租約、重試、舊租約拒絕、成功不再寄、失敗上限與 RPC 權限。dispatcher SQL 另以本機 stand-ins 驗證；正式 cron／pg_net／Vault、Edge Runtime SMTP 已通過一次測試，未授權呼叫回應 401；Gmail 實際收件待使用者確認。

## 官方依據

- https://supabase.com/docs/guides/functions/limits （25、587 禁止對外連線）
- https://github.com/supabase/supabase/blob/master/examples/edge-functions/supabase/functions/send-email-smtp/index.ts （SMTP 與 Nodemailer 範例）
- https://support.google.com/accounts/answer/185833 （應用程式密碼需兩步驟驗證）

以上官方資料於 2026-10-08 查證。
