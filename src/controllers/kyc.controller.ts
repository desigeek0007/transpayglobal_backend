import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadFile } from '../utils/storage';
import { toKycDTO, toUserDTO } from '../utils/mappers';
import { AuthedRequest } from '../middleware/auth';

type KycFiles = {
  idDocument?: Express.Multer.File[];
  proofOfAddress?: Express.Multer.File[];
  paymentScreenshot?: Express.Multer.File[];
};

async function getOrCreateKycRecord(userId: string) {
  const { data: existing } = await supabase.from('kyc_records').select('*').eq('user_id', userId).maybeSingle();
  if (existing) return existing;

  const { data: created, error } = await supabase
    .from('kyc_records')
    .insert({ user_id: userId })
    .select()
    .single();
  if (error || !created) throw new ApiError(500, error?.message || 'Failed to initialize KYC record');
  return created;
}

// Stored values, constrained by the kyc_records CHECK constraints.
const PAYMENT_STATUSES = ['unpaid', 'pending', 'paid'] as const;
const KYC_STATUSES = ['not_submitted', 'pending', 'approved', 'rejected'] as const;

// The admin UI speaks a slightly different vocabulary than the database does:
// its payment dropdown offers Pending/"approved" and its KYC dropdown offers
// Pending/"completed", and it decides whether to even show the KYC dropdown by
// testing `paymentStatus === 'approved' || 'completed'`. Rather than widen the
// CHECK constraints, translate at the edge — accept the UI's words on the way
// in (normalize* below) and speak them on the way out (toKycDTO maps the
// stored 'paid' back to 'approved'). Anything already using the stored words
// keeps working, so both vocabularies are valid input.
const PAYMENT_STATUS_ALIASES: Record<string, (typeof PAYMENT_STATUSES)[number]> = {
  unpaid: 'unpaid',
  not_paid: 'unpaid',
  pending: 'pending',
  paid: 'paid',
  approved: 'paid',
  completed: 'paid',
};

const KYC_STATUS_ALIASES: Record<string, (typeof KYC_STATUSES)[number]> = {
  not_submitted: 'not_submitted',
  pending: 'pending',
  approved: 'approved',
  completed: 'approved',
  rejected: 'rejected',
};

function normalize<T extends string>(
  aliases: Record<string, T>,
  value: unknown,
  errorMessage: string
): T {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : '';
  const normalized = aliases[key];
  if (!normalized) throw ApiError.badRequest(errorMessage);
  return normalized;
}

const normalizePaymentStatus = (value: unknown) =>
  normalize(PAYMENT_STATUS_ALIASES, value, 'Invalid payment status');

const normalizeKycStatus = (value: unknown) => normalize(KYC_STATUS_ALIASES, value, 'Invalid status');

const REQUIRED_FIELDS = ['date_of_birth', 'phone_number', 'address', 'city', 'country', 'postal_code'] as const;

// What "the user finished the wizard" means for the live 4-step flow: personal
// info, an ID document, and a membership payment screenshot. Proof of address
// is NOT part of it — the frontends dropped that step (see the "Address/
// proofOfAddress step removed from the flow" note in the dashboard wizard), so
// requiring it here would leave every record stuck at 'not_submitted'.
function isFullySubmitted(record: any): boolean {
  return (
    REQUIRED_FIELDS.every((f) => !!record[f]) &&
    !!record.id_document_url &&
    !!record.payment_screenshot_url
  );
}

async function applyReferralCodeIfNeeded(userId: string, referralCode?: string) {
  if (!referralCode) return;
  const code = referralCode.trim().toUpperCase();
  if (!code) return;

  const { data: user } = await supabase.from('users').select('referred_by').eq('id', userId).single();
  if (user?.referred_by) return; // already attributed, don't overwrite

  const { data: referrer } = await supabase
    .from('users')
    .select('id')
    .eq('referral_code', code)
    .neq('id', userId)
    .maybeSingle();
  if (referrer) {
    await supabase.from('users').update({ referred_by: referrer.id }).eq('id', userId);
  }
}

const submitSchema = z.object({
  dateOfBirth: z.string().min(1, 'Date of birth is required'),
  phoneNumber: z.string().min(1, 'Phone number is required'),
  address: z.string().min(1, 'Address is required'),
  city: z.string().min(1, 'City is required'),
  country: z.string().min(1, 'Country is required'),
  postalCode: z.string().min(1, 'Postal code is required'),
});

export const submitKyc = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = submitSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const files = req.files as KycFiles;
  const idDocumentFile = files?.idDocument?.[0];
  const proofOfAddressFile = files?.proofOfAddress?.[0];
  if (!idDocumentFile || !proofOfAddressFile) {
    throw ApiError.badRequest('idDocument and proofOfAddress files are required');
  }

  const userId = req.user!.id;
  await getOrCreateKycRecord(userId);

  const [idDocumentUrl, proofOfAddressUrl] = await Promise.all([
    uploadFile(STORAGE_BUCKETS.kycDocuments, idDocumentFile, `${userId}/id-document`),
    uploadFile(STORAGE_BUCKETS.kycDocuments, proofOfAddressFile, `${userId}/proof-of-address`),
  ]);

  const submittedAt = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from('kyc_records')
    .update({
      date_of_birth: parsed.data.dateOfBirth,
      phone_number: parsed.data.phoneNumber,
      address: parsed.data.address,
      city: parsed.data.city,
      country: parsed.data.country,
      postal_code: parsed.data.postalCode,
      id_document_url: idDocumentUrl,
      proof_of_address_url: proofOfAddressUrl,
      status: 'pending',
      submitted_at: submittedAt,
    })
    .eq('user_id', userId)
    .select()
    .single();

  if (error || !updated) throw new ApiError(500, error?.message || 'Failed to submit KYC');

  const kyc = toKycDTO(updated);
  res.status(201).json({
    message: 'KYC submitted successfully and is pending review',
    status: kyc!.status,
    kyc,
  });
});

export const getKycStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const record = await getOrCreateKycRecord(req.user!.id);
  // The wizard rehydrates itself entirely from this response: it prefills the
  // personal-info inputs and decides whether the ID document / payment
  // screenshot steps are already done from `idDocument` / `paymentScreenshot`.
  // Returning only the status flags made every uploaded file look missing
  // after a reload, so the whole saved record is returned here.
  res.json({
    submitted: record.status !== 'not_submitted',
    ...toKycDTO(record),
  });
});

// The 4 steps the frontends render, in the order they render them. Both the
// web wizard (app/app/dashboard/kyc/page.tsx) and the native KYCScreen map the
// response by step NUMBER, and the dashboard progress cards (KYCStatus.tsx /
// KYCStatusCard.tsx) map it by ARRAY INDEX, to exactly these four titles:
//
//   1 Personal Information  2 Identity Verification  3 Payment  4 Final Review
//
// So this list must stay 4 entries long and stay in this order. An earlier
// 5-step split (personal / address / documents / payment / review) shifted
// everything by one, which is why uploading an ID document lit up "Payment"
// instead of "Identity Verification".
const KYC_STEPS = [
  {
    step: 1,
    name: 'Personal Information',
    check: (r: any) => REQUIRED_FIELDS.every((f) => !!r[f]),
  },
  { step: 2, name: 'Identity Verification', check: (r: any) => !!r.id_document_url },
  {
    step: 3,
    name: 'Payment',
    check: (r: any) => !!r.payment_screenshot_url || r.payment_status === 'paid',
  },
  { step: 4, name: 'Final Review', check: (r: any) => r.status === 'approved' },
];
const POINTS_PER_STEP = 20 / KYC_STEPS.length;

export const getKycSteps = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const record = await getOrCreateKycRecord(req.user!.id);
  const steps = KYC_STEPS.map(({ step, name, check }) => ({ step, name, completed: check(record) }));
  const completedSteps = steps.filter((s) => s.completed).length;
  res.json({ steps, completedSteps, score: Math.round(completedSteps * POINTS_PER_STEP) });
});

export const saveKycPartial = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id;
  const record = await getOrCreateKycRecord(userId);
  const body = req.body as Record<string, string | undefined>;
  const files = req.files as KycFiles;

  const update: Record<string, any> = {};
  if (body.dateOfBirth) update.date_of_birth = body.dateOfBirth;
  if (body.phoneNumber) update.phone_number = body.phoneNumber;
  if (body.address) update.address = body.address;
  if (body.city) update.city = body.city;
  if (body.country) update.country = body.country;
  if (body.postalCode) update.postal_code = body.postalCode;
  if (body.referralCode !== undefined) update.referral_code = body.referralCode || null;
  if (body.paymentStatus) update.payment_status = normalizePaymentStatus(body.paymentStatus);

  const idDocumentFile = files?.idDocument?.[0];
  const proofOfAddressFile = files?.proofOfAddress?.[0];
  const paymentScreenshotFile = files?.paymentScreenshot?.[0];
  if (idDocumentFile) {
    update.id_document_url = await uploadFile(STORAGE_BUCKETS.kycDocuments, idDocumentFile, `${userId}/id-document`);
  }
  if (proofOfAddressFile) {
    update.proof_of_address_url = await uploadFile(
      STORAGE_BUCKETS.kycDocuments,
      proofOfAddressFile,
      `${userId}/proof-of-address`
    );
  }
  // Step 3 of the wizard posts the membership payment screenshot to this same
  // endpoint. Uploading one means the payment is awaiting admin verification,
  // so default payment_status to 'pending' unless the caller said otherwise.
  if (paymentScreenshotFile) {
    update.payment_screenshot_url = await uploadFile(
      STORAGE_BUCKETS.kycDocuments,
      paymentScreenshotFile,
      `${userId}/payment-screenshot`
    );
    if (!update.payment_status && record.payment_status !== 'paid') {
      update.payment_status = 'pending';
    }
  }

  const merged = { ...record, ...update };
  if (record.status === 'not_submitted' && isFullySubmitted(merged) && body.skip === undefined) {
    update.status = 'pending';
    update.submitted_at = new Date().toISOString();
  }

  const { data: updated, error } = await supabase
    .from('kyc_records')
    .update(update)
    .eq('user_id', userId)
    .select()
    .single();
  if (error || !updated) throw new ApiError(500, error?.message || 'Failed to save KYC draft');

  if (body.referralCode) {
    await applyReferralCodeIfNeeded(userId, body.referralCode);
  }

  const kyc = toKycDTO(updated);
  res.json({
    message: body.skip !== undefined ? 'Step skipped' : 'Progress saved',
    status: kyc!.status,
    // The wizard reads back `kyc.idDocument` / `kyc.paymentScreenshot` right
    // after saving to show the stored filename without a refetch, so return
    // the full record rather than just the status fields.
    kyc,
  });
});

export const updateOwnPaymentStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const paymentStatus = normalizePaymentStatus(req.body?.paymentStatus);

  await getOrCreateKycRecord(req.user!.id);
  const { data: updated, error } = await supabase
    .from('kyc_records')
    .update({ payment_status: paymentStatus })
    .eq('user_id', req.user!.id)
    .select()
    .single();
  if (error || !updated) throw new ApiError(500, error?.message || 'Failed to update payment status');

  res.json({ message: 'Payment status updated', ...toKycDTO(updated) });
});

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminListKyc = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('kyc_records')
    .select('*, users(id, full_name, email, referral_code, balance, kyc_completed, created_at)')
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, error.message);
  res.json({
    kyc: (data || []).map((row: any) => ({
      ...toKycDTO(row),
      user: row.users ? toUserDTO(row.users) : null,
    })),
  });
});

export const adminUpdateKycStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const status = normalizeKycStatus(req.body?.status);

  const { data: record, error } = await supabase
    .from('kyc_records')
    .update({ status })
    .eq('id', req.params.kycId)
    .select()
    .single();
  if (error || !record) throw ApiError.notFound('KYC record not found');

  await supabase.from('users').update({ kyc_completed: status === 'approved' }).eq('id', record.user_id);

  res.json({ message: 'KYC status updated', kyc: toKycDTO(record) });
});

export const adminUpdateKycPaymentStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const paymentStatus = normalizePaymentStatus(req.body?.paymentStatus);

  const { data: record, error } = await supabase
    .from('kyc_records')
    .update({ payment_status: paymentStatus })
    .eq('id', req.params.kycId)
    .select()
    .single();
  if (error || !record) throw ApiError.notFound('KYC record not found');

  res.json({ message: 'Payment status updated', kyc: toKycDTO(record) });
});
