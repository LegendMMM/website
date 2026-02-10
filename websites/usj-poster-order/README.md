# 環球影城海報冊代購網站

這是一個可部署在 GitHub Pages 的靜態網站，搭配 Supabase 作為資料庫與權限控管。

## 功能
- 前台表單：使用者填寫訂購資訊
- 訂單查詢：姓名 + 手機末3碼
- 管理頁：Email 一次性密碼登入（OTP）
- 管理功能：建立新活動、查看隱私欄位、更新狀態、匯出 CSV
- 可擴充：可建立多個活動（campaign），前台會自動讀取活動清單

## 目錄
- `index.html`: 前台填單與查詢
- `admin.html`: 管理頁
- `assets/config.js`: Supabase 設定（需自行填入）
- `supabase/schema.sql`: 資料表與權限 SQL

## Supabase 設定步驟
1. 在 Supabase 建立新 Project。
2. 打開 SQL Editor，貼上 `supabase/schema.sql` 內容並執行。
3. 將 SQL 最下方 `your-email@example.com` 改成你的管理員 Email 後再執行一次。
4. 到 Project Settings > API，找到：
   - Project URL
   - `anon` public key
5. 打開 `assets/config.js`，填入 URL 與 anon key。
6. 到 Authentication > URL Configuration：
   - 新增 `Site URL`（你的 GitHub Pages 網址）
   - 新增 `Redirect URLs`：`https://<username>.github.io/<repo>/websites/usj-poster-order/admin.html`
7. 到 Authentication > Providers > Email，確認 Email 登入啟用。

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
- 管理者：打開 `admin.html`，輸入 Email 收到一次性登入連結。
- 登入後可：
  - 建立新活動（slug + title）
  - 切換活動查看訂單
  - 更新訂單狀態
  - 匯出 CSV

## 未來開新代購活動
- 不需要改程式，直接在管理頁「建立新活動表單」。
- 活動建立後，前台活動下拉選單會自動出現。

## 注意事項
- `anon key` 是公開用金鑰，可放在前端；真正權限由 RLS policy 控管。
- 匯款帳號、手機、Email 等敏感資料只允許管理者在 `orders` 表查詢。
- 前台查詢走 `search_order_status` 函式，不會回傳匯款帳號等敏感欄位。
