# Wise Reconciliation App

Next.js + Prisma + Postgres app for two-party shipment, transfer, approval, and JPY settlement workflows.

## Cloud Target

- Runtime: Vercel
- Database: Neon Postgres or another Vercel Marketplace Postgres provider
- Project root: `websites/reconciliation-app`
- Production build command: `npm run vercel-build`
- Production URL: https://reconciliation-app-beta.vercel.app/

## Environment Variables

Set these in Vercel for Production and Preview:

```text
DATABASE_URL
SESSION_SECRET
ADMIN_EMAIL
ADMIN_PASSWORD
PARTNER_EMAIL
PARTNER_PASSWORD
```

Use a pooled Postgres connection string for `DATABASE_URL` when your provider offers one. `SESSION_SECRET` must be at least 32 characters in production.

## Local Setup

1. Copy `.env.example` to `.env`.
2. Fill in `DATABASE_URL` and `SESSION_SECRET`.
3. Install dependencies:

```powershell
npm ci
```

4. Create the database schema:

```powershell
npm run db:migrate:deploy
```

5. Seed the initial admin and partner accounts:

```powershell
npm run db:seed
```

Running `db:seed` syncs the two seed accounts and the default Wise setting to the current environment variables. Do not rerun it after users change their passwords unless you intentionally want to reset the seed account passwords.

6. Start the app:

```powershell
npm run dev
```

## First Cloud Deploy

1. Create a Vercel project with root directory `websites/reconciliation-app`.
2. Create or connect a Neon Postgres database.
3. Add the environment variables listed above.
4. Run production migrations against the cloud database:

```powershell
npm run db:migrate:deploy
```

5. Seed the first two accounts:

```powershell
npm run db:seed
```

If Vercel marks passwords as sensitive, `vercel env pull` may not provide usable plaintext values for local seeding. In that case, set `ADMIN_EMAIL`, `ADMIN_PASSWORD`, `PARTNER_EMAIL`, and `PARTNER_PASSWORD` in the shell before running `db:seed`.

6. Deploy:

```powershell
vercel --prod
```

## Validation

```powershell
npm test
npm run typecheck
npm run build
```

After deployment, verify:

- `/login` returns 200.
- Admin login succeeds.
- Partner login succeeds.
- A pending ledger entry can be created and confirmed by the other account.
- A confirmed entry can be included in a settlement only once.
