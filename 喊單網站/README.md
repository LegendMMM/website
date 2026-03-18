# 團購喊單與盲盒拆分系統

這個專案是一套給團主使用的「活動導覽 + 商品下單 + 盲盒拆分 + 後台審核」網站。

目前的系統核心不是傳統電商的一次結帳，而是：

- 會員先進活動挑商品
- 一般商品可直接加入購物車
- 盲盒商品需進拆分頁選角色子項
- 下單後會建立訂單與 `LOCKED` 喊單
- 團主在後台依角色固位、釋出階段、順位與庫存決定是否確認分配
- 只有 `CONFIRMED` 的喊單才會進入後續結算、付款與物流流程

## 目前版本已實作

### 前台

- Email / FB 暱稱登入
- 新會員註冊
- 活動列表與活動截止時間顯示
- 依商品分類瀏覽活動商品
- 一般商品加入購物車
- 盲盒母商品進入拆分頁後，按角色子項加入購物車
- 即時檢查庫存、每人上限、固位資格、釋出階段
- 購物車改數量、移除、依活動下單
- 個人頁查看自己的訂單與喊單紀錄

### 後台

- 儀表板查看會員數、喊單數、訂單數、待對帳付款、物流筆數、總金額
- 會員管理
  - 設為 / 取消管理員
  - 調整取貨率
  - 刪除會員
- 角色固位管理
  - 單筆指定
  - 批次套用
  - 依角色自動分配
- 全站喊單總表
  - 依活動 / 狀態 / 關鍵字篩選
  - 確認分配
  - 取消喊單
- 全站訂單管理
  - 訂單狀態切換
- 物流管理
  - 查看物流資料
  - 匯出指定活動的賣貨便 CSV
- 活動與商品設定
  - 分類管理
  - 新增活動
  - 新增一般商品 / 盲盒母商品
  - 新增盲盒角色子項
  - 批次匯入商品資料
  - 直接編輯商品、盲盒子項、活動釋出階段
  - 商品圖片上傳或使用圖片 URL

## 目前版本的規則

- 角色順位：`FIXED_1 > FIXED_2 > FIXED_3 > LEAK_PICK`
- 同級順位：先喊先贏
- 活動可設定釋出階段：
  - `FIXED_1_ONLY`
  - `FIXED_1_2`
  - `FIXED_1_2_3`
  - `ALL_OPEN`
- 一般商品預設全員可購買，但管理員可對單一商品額外啟用固位限制
- 盲盒母商品可單獨啟用固位限制；若未指定限制角色，則依子項角色判斷
- 盲盒母商品本身不控庫存，實際名額放在盲盒子項
- 盲盒子項價格可留空，留空時沿用母商品價格
- 下單後建立的喊單預設是 `LOCKED`
- 只有團主可將喊單改成 `CONFIRMED` 或 `CANCELLED_BY_ADMIN`
- 貨到付款限制：
  - 取貨率需 `>= 90%`
  - 且結算金額需 `<= 300`
- 匯款 / 無卡存款需填末五碼

## 目前 UI 與資料層的狀態

這一版前台主流程已完成到：

- 登入 / 註冊
- 活動導覽
- 商品挑選
- 購物車
- 下單
- 個人訂單 / 喊單紀錄

付款提交與物流建立的資料模型、商業規則、後台對帳 / 匯出能力都已存在，但目前會員前台尚未提供完整的付款 / 物流填單頁面。

## 技術棧

- 前端：Vite + React 18 + TypeScript
- 樣式：Tailwind CSS
- 動畫：Framer Motion
- 資料中心：Supabase
- 本地 Demo：localStorage

## 專案結構

- `src/App.tsx`
  - 前台與後台主要畫面
- `src/hooks/useOrderSystem.ts`
  - 核心狀態與商業流程
- `src/lib/business-rules.ts`
  - 固位、順位、付款限制等規則
- `src/lib/supabase.ts`
  - Supabase 與圖片上傳
- `src/lib/supabase-sync.ts`
  - 前端狀態與 Supabase 同步
- `src/data/seed.ts`
  - Demo 模式預設資料
- `supabase/schema.sql`
  - 目前資料表結構

## 快速開始

1. 安裝 Node.js 20+
2. 安裝依賴

```bash
npm install
```

3. 複製環境變數

```bash
cp .env.example .env
```

4. 啟動開發環境

```bash
npm run dev
```

5. 建置正式版

```bash
npm run build
```

## 資料模式

### Local Demo 模式

未設定 Supabase 時，系統會使用 localStorage。

特性：

- 第一次進站會載入 `src/data/seed.ts` 的測試資料
- 後續操作會持續寫回 localStorage
- 適合先驗證前後台流程

### Supabase 遠端模式

設定 `VITE_SUPABASE_URL` 與 `VITE_SUPABASE_ANON_KEY` 後，系統會改用 Supabase 讀寫資料。

## Supabase 設定

1. 在 Supabase 建立專案
2. 執行 `supabase/schema.sql`
3. 如果你是從舊版資料庫升級，請依 `supabase/migrations/` 內檔名日期順序補跑需要的 migration
4. 在 `.env` 設定：

```bash
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

### 圖片上傳

若要讓後台圖片上傳真正存到 Supabase Storage，請另外建立 bucket：

- bucket 名稱：`handan-images`

若 Storage 未設好，系統會退回使用嵌入式圖片資料 URL，不會阻斷商品建立流程。

### 管理員權限

可在 Supabase SQL Editor 執行：

```sql
select public.set_admin_override('your-email@example.com', true, 'promote as admin');
```

取消管理員：

```sql
select public.set_admin_override('your-email@example.com', false, 'revoke admin');
```

## 批次匯入

目前後台支援 6 種匯入模式：

- 一般商品 CSV
- 一般商品 JSON
- 盲盒母商品 CSV
- 盲盒母商品 JSON
- 盲盒子項 CSV
- 盲盒子項 JSON

可先在後台按「載入模板」，再貼上資料匯入。

## Demo 測試帳號

- 管理員：
  - `admin@example.com`
  - `團主Momo`
- 一般會員：
  - `yachiyo@example.com` / `八千代派`
  - `noi@example.com` / `乃依一生推`
  - `newbie@example.com` / `新手小葵`

## 指令

```bash
npm run dev
npm run build
npm run preview
npm run lint
```

## 部署

目前 repo 內沒有現成的 GitHub Actions 部署 workflow。

若要部署，可自行將 `npm run build` 產生的 `dist/` 發佈到靜態主機，或另外補上自己的部署流程。

若要部署到子路徑，可在 `.env` 設定：

```bash
VITE_BASE_PATH=/your-repo-name/
```
