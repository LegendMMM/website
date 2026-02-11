# 環球影城海報冊代購網站

這是一個可部署在 GitHub Pages 的靜態網站，搭配 Supabase 作為資料庫與權限控管。

## 功能
- 前台表單：使用者填寫訂購資訊
- 活動說明 / 注意事項：依不同活動顯示不同內容
- 訂單查詢：姓名或電話皆可查詢
- 管理頁：帳號密碼登入（Email + Password）
- 管理功能：
  - `admin.html` 管理首頁
  - `admin-campaigns.html` 活動管理
  - `admin-orders.html` 訂單管理
  - `admin-settings.html` 系統設定（可新增/修改全域狀態）
  - 訂單狀態可自由切換（依全域或活動自訂狀態清單）
  - 匯出 CSV
- B+ 欄位模板：
  - 全域預設欄位模板（建立活動前可改）
  - 活動欄位覆寫（建立活動後可改）
  - 關鍵欄位保護（不可刪除或隱藏）
  - 訂單欄位快照（每筆訂單保存當下欄位版本）
- 自訂欄位：每個活動可設定不同欄位（決定每筆訂單有哪些資料）
- 可擴充：可建立多個活動（campaign），前台會自動讀取活動清單

## 目錄
- `index.html`: 前台填單與查詢
- `admin.html`: 管理首頁（登入與分頁入口）
- `admin-campaigns.html`: 活動管理
- `admin-orders.html`: 訂單管理
- `admin-settings.html`: 系統設定
- `assets/config.js`: Supabase 設定（需自行填入）
- `supabase/schema.sql`: 資料表與權限 SQL

## Supabase 設定步驟
1. 在 Supabase 建立新 Project。
2. 打開 SQL Editor，貼上 `supabase/schema.sql` 內容並執行。
3. 如果你是從舊版本升級，一樣直接重跑這份 SQL（它包含升級欄位：`transaction_method`、`custom_fields`、`extra_data`、`notice`、`field_config`、`field_snapshot`、`status_options`，以及狀態紀錄表 `order_status_logs` 和 `app_settings`）。
4. 到 Project Settings > API，找到：
   - Project URL
   - `anon` public key
5. 打開 `assets/config.js`，填入 URL 與 anon key。
6. 到 Authentication > Providers > Email，啟用 Email + Password。
7. 到 Authentication > Users 建立管理者帳號（Email + Password）。
8. 確認 `public.admins` 有同一個 Email（本 SQL 已預設加入：`49125466easongo@gmail.com`）。

## GitHub Pages 部署
1. 推送程式到 GitHub。
2. 在 GitHub repo 的 Settings > Pages：
   - Source: `Deploy from a branch`
   - Branch: `main`
   - Folder: `/ (root)`
3. 部署完成後使用：
   - `https://<username>.github.io/<repo>/websites/usj-poster-order/`

## 使用流程
- 一般使用者：打開前台 `index.html`，填寫訂購資訊。
- 管理者：打開 `admin.html`，輸入 Email + Password 登入。
- 登入後可：
  - 建立新活動（只填標題，slug 自動產生）
  - 修改既有活動（標題、說明、注意事項、是否啟用、自訂欄位、活動專屬狀態）
  - 修改全域預設欄位模板（新活動會套用）
  - 修改活動欄位覆寫（欄位名稱/順序/必填/顯示/placeholder）
  - 在系統設定維護全域狀態清單
  - 切換活動查看訂單
  - 直接修改整筆訂單內容（不只狀態，且可自由切換狀態）
  - 查看狀態變更紀錄
  - 匯出 CSV

## 未來開新代購活動
- 不需要改程式，直接在管理頁「建立新活動表單」。
- 若新活動欄位不同，可在活動設定中修改 `自訂欄位 JSON`，再到「活動欄位覆寫」調整顯示細節。
- 活動建立後，前台活動下拉選單會自動出現。

## 注意事項
- `anon key` 是公開用金鑰，可放在前端；真正權限由 RLS policy 控管。
- 匯款帳號、手機、Email 等敏感資料只允許管理者在 `orders` 表查詢。
- 前台查詢走 `search_order_status` 函式，不會回傳匯款帳號等敏感欄位。
