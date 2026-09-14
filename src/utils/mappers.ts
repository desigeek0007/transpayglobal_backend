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
