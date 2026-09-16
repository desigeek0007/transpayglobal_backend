// Maps snake_case Postgres rows to the camelCase shapes the frontend (lib/api/types.ts) expects.

export function toUserDTO(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    email: row.email,
    fullName: row.full_name,
    kycCompleted: row.kyc_completed,
    referralCode: row.referral_code,
    balance: row.balance !== undefined && row.balance !== null ? Number(row.balance) : 0,
    walletAddress: row.wallet_address ?? null,
    bankCountry: row.bank_country ?? null,
    bankCity: row.bank_city ?? null,
    bankName: row.bank_name ?? null,
    bankIban: row.bank_iban ?? null,
    createdAt: row.created_at,
    role: row.role,
  };
}

export function toReferralUserDTO(row: any) {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    createdAt: row.created_at,
    balance: row.balance !== undefined && row.balance !== null ? Number(row.balance) : 0,
    kycCompleted: row.kyc_completed,
  };
}

// The KYC shape both frontends read (lib/api/kyc.ts consumers: the dashboard
// KYC wizard, the native KYCScreen, and the admin KYC screens). They read
// `idDocument` / `proofOfAddress` / `paymentScreenshot` to decide whether a
// step is already done, and `kyc.id` to target the admin status endpoints, so
// every one of these must be present on every KYC payload we return.
export function toKycDTO(row: any) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    // The UIs speak 'completed'/'approved' where the table stores
    // 'approved'/'paid' — the admin KYC screen's dropdowns and its "Completed"
    // counter only ever match those words, and every other consumer already
    // accepts them. So the DTO translates on the way out; the controllers
    // accept either vocabulary on the way in (see the alias tables in
    // kyc.controller.ts).
    status: row.status === 'approved' ? 'completed' : row.status,
    paymentStatus: row.payment_status === 'paid' ? 'approved' : row.payment_status,
    dateOfBirth: row.date_of_birth,
    phoneNumber: row.phone_number,
    address: row.address,
    city: row.city,
    country: row.country,
    postalCode: row.postal_code,
    idDocument: row.id_document_url,
    proofOfAddress: row.proof_of_address_url,
    paymentScreenshot: row.payment_screenshot_url,
    referralCode: row.referral_code,
    submittedAt: row.submitted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toChatMessageDTO(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.user_id || row.guest_email,
    userEmail: row.users?.email ?? row.guest_email ?? '',
    userName: row.users?.full_name ?? row.guest_name ?? 'Guest',
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    // Some frontend code reads `timestamp` instead of `createdAt`.
    timestamp: row.created_at,
  };
}

export function toPaymentDTO(row: any) {
  if (!row) return row;
  return {
    id: row.id,
    userId: row.user_id,
    user: row.users
      ? {
          id: row.user_id,
          email: row.users.email,
          fullName: row.users.full_name,
          balance: Number(row.users.balance),
        }
      : null,
    amount: Number(row.amount),
    type: row.type,
    description: row.description ?? null,
    paymentScreenshot: row.payment_screenshot_url,
    paymentStatus: row.payment_status,
    status: row.status,
    previousBalance: row.previous_balance !== null && row.previous_balance !== undefined ? Number(row.previous_balance) : null,
    newBalance: row.new_balance !== null && row.new_balance !== undefined ? Number(row.new_balance) : null,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}
