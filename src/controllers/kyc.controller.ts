import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadFile } from '../utils/storage';
import { AuthedRequest } from '../middleware/auth';

type KycFiles = { idDocument?: Express.Multer.File[]; proofOfAddress?: Express.Multer.File[] };

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

const REQUIRED_FIELDS = ['date_of_birth', 'phone_number', 'address', 'city', 'country', 'postal_code'] as const;

function isFullySubmitted(record: any): boolean {
  return (
    REQUIRED_FIELDS.every((f) => !!record[f]) && !!record.id_document_url && !!record.proof_of_address_url
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

  res.status(201).json({
    message: 'KYC submitted successfully and is pending review',
    status: updated.status,
    kyc: { id: updated.id, status: updated.status, submittedAt: updated.submitted_at },
  });
});

export const getKycStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const record = await getOrCreateKycRecord(req.user!.id);
  res.json({
    submitted: record.status !== 'not_submitted',
    status: record.status,
    submittedAt: record.submitted_at,
    updatedAt: record.updated_at,
  });
});

const KYC_STEPS = [
  { step: 1, name: 'Personal Information', check: (r: any) => !!r.date_of_birth && !!r.phone_number },
  { step: 2, name: 'Address Details', check: (r: any) => !!r.address && !!r.city && !!r.country && !!r.postal_code },
  { step: 3, name: 'Document Upload', check: (r: any) => !!r.id_document_url && !!r.proof_of_address_url },
  { step: 4, name: 'Membership Payment', check: (r: any) => r.payment_status === 'paid' },
  { step: 5, name: 'Verification Review', check: (r: any) => r.status === 'approved' },
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

  const idDocumentFile = files?.idDocument?.[0];
  const proofOfAddressFile = files?.proofOfAddress?.[0];
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

  res.json({
    message: body.skip !== undefined ? 'Step skipped' : 'Progress saved',
    status: updated.status,
    kyc: {
      id: updated.id,
      status: updated.status,
      paymentStatus: updated.payment_status,
      submittedAt: updated.submitted_at,
    },
  });
});

const paymentStatusSchema = z.object({
  paymentStatus: z.enum(['unpaid', 'pending', 'paid']),
});

export const updateOwnPaymentStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = paymentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid payment status');

  await getOrCreateKycRecord(req.user!.id);
  const { data: updated, error } = await supabase
    .from('kyc_records')
    .update({ payment_status: parsed.data.paymentStatus })
    .eq('user_id', req.user!.id)
    .select()
    .single();
  if (error || !updated) throw new ApiError(500, error?.message || 'Failed to update payment status');

  res.json({ message: 'Payment status updated', paymentStatus: updated.payment_status });
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
  res.json({ kyc: data || [] });
});

const adminStatusSchema = z.object({ status: z.enum(['not_submitted', 'pending', 'approved', 'rejected']) });

export const adminUpdateKycStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminStatusSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid status');

  const { data: record, error } = await supabase
    .from('kyc_records')
    .update({ status: parsed.data.status })
    .eq('id', req.params.kycId)
    .select()
    .single();
  if (error || !record) throw ApiError.notFound('KYC record not found');

  await supabase
    .from('users')
    .update({ kyc_completed: parsed.data.status === 'approved' })
    .eq('id', record.user_id);

  res.json({ message: 'KYC status updated', kyc: record });
});

const adminPaymentStatusSchema = z.object({ paymentStatus: z.enum(['unpaid', 'pending', 'paid']) });

export const adminUpdateKycPaymentStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminPaymentStatusSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid payment status');

  const { data: record, error } = await supabase
    .from('kyc_records')
    .update({ payment_status: parsed.data.paymentStatus })
    .eq('id', req.params.kycId)
    .select()
    .single();
  if (error || !record) throw ApiError.notFound('KYC record not found');

  res.json({ message: 'Payment status updated', kyc: record });
});
