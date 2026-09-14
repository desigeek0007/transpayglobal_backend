-- TransPay Global backend schema
-- Run this in the Supabase SQL Editor (or via `npm run migrate` with SUPABASE_DB_URL set).
--
-- Design note: the Express backend connects with the Supabase *secret* key,
-- which bypasses Row Level Security entirely. RLS is still enabled below with
-- no permissive policies, so the publishable (anon) key and any authenticated
-- Supabase session can never read/write these tables directly -- all access
-- must go through the backend API, which enforces ownership/admin checks in
-- application code (see backend/src/middleware/auth.ts).

create extension if not exists pgcrypto;

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

-- ============================================================================
-- users
-- ============================================================================
create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null unique,
  password_hash text not null,
  referral_code text not null unique,
  referred_by uuid references users(id) on delete set null,
  balance numeric(14, 2) not null default 0,
  wallet_address text,
  bank_country text,
  bank_city text,
  bank_name text,
  bank_iban text,
  kyc_completed boolean not null default false,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_users_referred_by on users(referred_by);

drop trigger if exists trg_users_updated_at on users;
create trigger trg_users_updated_at before update on users
  for each row execute function set_updated_at();

alter table users enable row level security;

-- ============================================================================
-- kyc_records — one per user (identity verification + $10 membership payment)
-- ============================================================================
create table if not exists kyc_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references users(id) on delete cascade,
  date_of_birth date,
  phone_number text,
  address text,
  city text,
  country text,
  postal_code text,
  id_document_url text,
  proof_of_address_url text,
  referral_code text,
  status text not null default 'not_submitted'
    check (status in ('not_submitted', 'pending', 'approved', 'rejected')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid')),
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists trg_kyc_records_updated_at on kyc_records;
create trigger trg_kyc_records_updated_at before update on kyc_records
  for each row execute function set_updated_at();

alter table kyc_records enable row level security;

-- ============================================================================
-- applications — generic "submit a form, admin reviews it" entity shared by
-- every product vertical (loans, credit cards, job postings/applications,
-- lawyer/case registration, doctor registration, patient consultancies,
-- travel vouchers, visa applications, scholarship unlocks, course
-- enrollments, copy-trading investments, voucher applications, charity and
-- entertainment requests). `type` discriminates the domain; `payload` holds
-- the domain-specific fields (see backend/src/services/applications.service.ts
-- for the full type union and each controller for its exact payload shape).
-- ============================================================================
create table if not exists applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  type text not null check (type in (
    'loan', 'credit_card', 'job_posting', 'job_application',
    'lawyer_registration', 'legal_case', 'doctor_registration',
    'patient_consultancy', 'travel_voucher', 'visa_application',
    'scholarship_unlock', 'course_enrollment', 'copy_trading_investment',
    'voucher_application', 'charity_request', 'entertainment_request'
  )),
  status text not null default 'pending',
  payment_status text,
  price numeric(14, 2),
  payload jsonb not null default '{}'::jsonb,
  admin_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_applications_user_type on applications(user_id, type);
create index if not exists idx_applications_type_status on applications(type, status);
create index if not exists idx_applications_payload_gin on applications using gin (payload);

drop trigger if exists trg_applications_updated_at on applications;
create trigger trg_applications_updated_at before update on applications
  for each row execute function set_updated_at();

alter table applications enable row level security;

-- ============================================================================
-- payments — wallet ledger (credits/debits against users.balance)
-- ============================================================================
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  application_id uuid references applications(id) on delete set null,
  amount numeric(14, 2) not null,
  type text not null check (type in ('credit', 'debit')),
  description text,
  payment_screenshot_url text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'approved')),
  status text not null default 'pending' check (status in ('pending', 'completed')),
  previous_balance numeric(14, 2),
  new_balance numeric(14, 2),
  processed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_payments_user on payments(user_id);

alter table payments enable row level security;

-- ============================================================================
-- form_submissions — fire-and-forget log for POST /api/notifications/form-submission
-- ============================================================================
create table if not exists form_submissions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete set null,
  form_type text not null,
  form_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table form_submissions enable row level security;
