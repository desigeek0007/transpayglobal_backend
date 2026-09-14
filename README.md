# TransPay Global — Backend

A standalone Node.js/Express + TypeScript REST API implementing the exact contract the
`trans-pay-global` Next.js frontend already expects (see `../lib/api/*.ts`), backed by
Supabase (Postgres + Storage).

## Stack

- **Express 4** + TypeScript, run with `tsx` in dev / compiled with `tsc` for prod
- **Supabase** — Postgres database, file storage, accessed via the **secret** API key
  (server-side only; bypasses Row Level Security, so every access rule — ownership,
  admin-only — is enforced in application code, not in the database)
- **JWT** bearer auth (`jsonwebtoken` + `bcryptjs`), matching the frontend's
  `localStorage.authToken` / `Authorization: Bearer <token>` flow
- **Zod** for request validation, **Multer** (memory storage) for file uploads

## Architecture

Nearly every product vertical (loans, credit cards, job postings/applications, lawyer/case
registration, doctor registration, patient consultancies, travel vouchers, visa
applications, scholarship unlocks, copy-trading investments, voucher applications, charity
and entertainment requests) is a "user submits a form, admin reviews it" flow. Rather than
hand-rolling sixteen near-identical CRUD stacks, they all share one generic `applications`
table (`type` discriminator + `payload jsonb`) via `src/services/applications.service.ts`.
Each domain controller still gets its own Zod schema and response shape matching the
frontend's `*Record` types exactly — the shared table is an implementation detail, not
something the API surface exposes.

Auth/users, KYC (its own table — richer status/step logic than a generic form), the wallet
ledger (`payments`), and the admin cross-domain views (`/api/admin/users`,
`/api/admin/dashboard/activities`) are bespoke.

```
src/
  config/        env loading, Supabase client, storage bucket names
  middleware/    JWT auth (required/optional/admin), file upload, error handling
  controllers/   one file per domain, matching backend/../lib/api/*.ts 1:1
  routes/        thin Express routers, mounted at /api in src/app.ts
  services/      applications.service.ts — the generic "form submission" persistence layer
  utils/         JWT, password hashing helpers, Supabase Storage upload, DTO mappers
scripts/
  bootstrap.ts   creates the private Storage buckets (safe to re-run)
  migrate.ts     applies supabase/migrations/*.sql via a direct Postgres connection
  seed.ts        creates/promotes a first admin account
supabase/
  migrations/0001_init.sql   full schema: users, kyc_records, applications, payments, form_submissions
```

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment** — copy `.env.example` to `.env` and fill in:
   - `JWT_SECRET` — any long random string
   - `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` — from your
     Supabase project's Settings → API
   - `CORS_ORIGIN` — the frontend's origin (`http://localhost:3000` in dev)

3. **Apply the database schema.** The Supabase *secret* key can read/write rows but can't
   run DDL over REST. Either:
   - Paste `supabase/migrations/0001_init.sql` into the Supabase Dashboard's SQL Editor
     and run it, **or**
   - Set `SUPABASE_DB_URL` in `.env` (Dashboard → Project Settings → Database →
     Connection string) and run `npm run migrate`. Note: this project's *direct*
     connection (`db.<ref>.supabase.co`) is IPv6-only — if your network has no IPv6
     route, use the **Session pooler** connection string instead (it's IPv4-compatible
     and already has the right region baked in).

4. **Create the Storage buckets** (KYC documents, resumes, misc uploads):

   ```bash
   npm run bootstrap
   ```

5. **Seed a first admin account** so you can log into `/app/admin` immediately:

   ```bash
   npm run seed
   # optionally: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... ADMIN_NAME="You" npm run seed
   ```

   Log in and change that password right away (`PUT /api/auth/change-password`).

6. **Run it**

   ```bash
   npm run dev     # tsx watch, http://localhost:3002
   npm run build && npm start   # production
   ```

7. **Point the frontend at it** — in the Next.js app's `lib/api/config.ts`, set
   `API_BASE_URL` to this server's URL (`http://localhost:3002` in dev, or wherever you
   deploy it).

## Notable design decisions

- **Card details are never persisted.** The copy-trading invest endpoint accepts a raw
  card number/expiry/CVV (matching the frontend form), but the backend only ever stores
  the last 4 digits — no real payment processor is integrated (see
  `../COPY_TRADING_FLOW.md` "Next Steps"), so there's no reason to hold PAN/CVV in the
  database even for a demo.
- **`POST /api/notifications/form-submission`** ("notify admin") has no email service
  configured (no SMTP credentials were provided), so submissions are persisted to a
  `form_submissions` table instead, with an admin-only `GET
  /api/admin/notifications/form-submissions` to actually see them — the minimal
  substitute for the documented "notify admin" behavior.
- **`payments` (wallet ledger) has no documented creation endpoint** in the frontend
  contract — only list/update/delete. `PUT /api/admin/payments/:id` implements the real
  balance math (credit/debit against `users.balance`) when a payment transitions to
  `completed`, but nothing currently inserts rows into that table. Wire up a creator
  (e.g. a referral-bonus credit, or a manual admin adjustment) if/when that UI exists.
- **RLS is enabled with no permissive policies** on every table. Only this backend's
  secret key can read/write; the publishable (anon) key sees nothing. This was verified
  directly against the live project during setup.
- Uploaded files are stored in private Supabase Storage buckets; the API returns
  long-lived (1 year) signed URLs rather than making the buckets public.
