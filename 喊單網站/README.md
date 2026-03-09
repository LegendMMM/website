# 團主喊單帳本系統 (Vite + React + Tailwind + Supabase)

這是一套「團主權威確認制」的喊單/排單網站，重點是：
- 前台 +1 後鎖定，不可自行刪單。
- 角色資格排序：固一 > 固二 > 固三 > 撿漏（同級先喊先贏）。
- 多檔期（Campaign）彼此獨立。
- 熱門/冷門調價模式與均價綁物模式。
- 付款對帳（末五碼）與物流信用限制（取貨率/COD 限制）。
- 支援匯出「賣貨便」CSV。

## 技術棧
- 前端：Vite + React + TypeScript + TailwindCSS + Framer Motion
- 後端資料中心：Supabase（Schema 提供於 `supabase/schema.sql`）
- 部署：GitHub Actions -> GitHub Pages

## 快速開始
1. 安裝 Node.js 20+
2. 安裝依賴：
   ```bash
   npm install
   ```
3. 建立環境變數：
   ```bash
   cp .env.example .env
   ```
4. 啟動開發：
   ```bash
   npm run dev
   ```

## Supabase 設定
1. 在 Supabase 建立專案。
2. 將 `supabase/schema.sql` 貼到 SQL Editor 執行。
3. 再執行 `supabase/migrations/20260309_upgrade_product_model.sql`（新增系列、固位限制、盲盒子項與訂單模型）。
4. 在 `.env` 填入：
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

> 未設定 Supabase 時，前端會使用 Demo Local 模式（localStorage）供流程驗證。

## 商品匯入（後台）
管理員頁提供四種批次匯入模式：
- 商品 CSV
- 商品 JSON
- 盲盒子項 CSV
- 盲盒子項 JSON

可先用「載入模板」再貼上資料直接匯入。

## 核心規則落地
- 禁止前台刪單：
  - 會員按 `+1` 後，前台按鈕鎖定。
  - 只能由團主後台執行「取消喊單」。
- 分配權：
  - 系統先排順位，但必須由團主點擊「確認分配」才生效。
  - 若超出庫存順位，團主無法確認，維持候補。
- 綁物演算法：
  - 僅在「均價+綁物模式」啟動。
  - 熱門角買家依權重（八千代 > 乃伊 > 彩葉 > 輝耀姬 > 帝）優先分配冷門餘量。
- 付款限制：
  - 若取貨率 < 90% 或結帳金額 > 300，隱藏貨到付款。
  - 匯款/無卡存款需填末五碼，後台可快速對帳。

## GitHub 部署
專案已提供 `.github/workflows/deploy.yml`：
- 推送 `main` 會自動建置與部署到 GitHub Pages。
- 請在 GitHub Secrets 設定：
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`

## 測試帳號（Demo 模式）
- 團主：`admin@example.com` 或 `團主Momo`（Email 或 FB 暱稱擇一登入）
- 會員：
  - yachiyo@example.com / 八千代派
  - noi@example.com / 乃依一生推
  - newbie@example.com / 新手小葵
