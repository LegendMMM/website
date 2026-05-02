# 雙方寄貨與 Wise 轉帳對帳網頁

這是一個 Next.js + Prisma + Postgres 的雙人對帳工具。你可以建立自己與日本對方的帳號，雙方登入後新增寄貨、轉帳或調整項目，待另一方確認後再產生 JPY 結算單。

## 本機啟動

1. 複製 `.env.example` 成 `.env`，填入 Postgres 的 `DATABASE_URL` 與 `SESSION_SECRET`。
2. 建立資料表：
   ```powershell
   npm run db:push
   ```
3. 建立初始管理員與對方帳號：
   ```powershell
   npm run db:seed
   ```
4. 啟動開發伺服器：
   ```powershell
   npm run dev
   ```

## 預設資料

`prisma/seed.ts` 會建立：

- 管理員：使用 `.env` 的 `ADMIN_EMAIL` / `ADMIN_PASSWORD`
- 對方帳號：使用 `.env` 的 `PARTNER_EMAIL` / `PARTNER_PASSWORD`
- Wise 固定估算：`1 TWD = 4.85 JPY`、固定費 `120 JPY`、比例費 `0.7%`

## 主要功能

- 帳密登入、登出、改密碼
- 管理員建立對方帳號並設定初始密碼
- 繁中 / 日文介面切換
- 寄貨、轉帳、調整記錄
- 每筆記錄支援多個自訂費用項目與 TWD/JPY
- 待確認、確認、拒絕流程
- 手動日期範圍產生 JPY 結算單
- Wise 固定匯率與手續費估算
- JSON API：`/api/auth/*`、`/api/ledger/*`、`/api/settings`、`/api/settlements`

## 驗證

```powershell
npm test
npm run typecheck
npm run build
```

## 部署

部署到 Vercel 時，設定以下環境變數：

- `DATABASE_URL`
- `SESSION_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `PARTNER_EMAIL`
- `PARTNER_PASSWORD`

部署後先執行 Prisma migration 或 `npm run db:push`，再執行 `npm run db:seed` 建立初始帳號。
