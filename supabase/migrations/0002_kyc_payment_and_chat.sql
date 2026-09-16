-- TransPay Global — migration 0002
--
-- Adds the two pieces of storage the frontends already depend on but that
-- 0001_init.sql never created:
--
--   1. kyc_records.payment_screenshot_url — the KYC flow is 4 steps in both
--      the web app and the native app (personal info -> ID document ->
--      membership payment -> final review). Step 3 uploads a payment
--      screenshot through POST /api/kyc/save, which had nowhere to land.
--   2. chat_messages — the in-app support chat (components/ui/ChatGPT.tsx and
--      AdminChatGPT.tsx) talks to /api/chat*, /api/admin/chat-*, which did not
--      exist server-side at all.

-- ============================================================================
-- kyc_records — membership payment screenshot
-- ============================================================================
alter table kyc_records add column if not exists payment_screenshot_url text;

-- ============================================================================
-- chat_messages — support chat between a visitor/user and an admin.
--
-- A conversation is keyed by user_id for a logged-in user, or by guest_email
-- for a visitor who only filled in the contact form. `role` follows the
-- frontend's vocabulary: 'user' = written by the visitor, 'assistant' =
-- written by an admin replying to them.
-- ============================================================================
create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references users(id) on delete cascade,
  guest_email text,
  guest_name text,
  guest_contact_number text,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  read_by_admin boolean not null default false,
  created_at timestamptz not null default now(),

  -- every message belongs to either a registered user or a guest email
  constraint chat_messages_owner_present check (user_id is not null or guest_email is not null)
);

create index if not exists idx_chat_messages_user on chat_messages(user_id, created_at desc);
create index if not exists idx_chat_messages_guest_email on chat_messages(guest_email, created_at desc);
create index if not exists idx_chat_messages_created_at on chat_messages(created_at desc);

alter table chat_messages enable row level security;
