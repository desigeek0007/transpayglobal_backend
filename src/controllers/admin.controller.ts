// Admin-only endpoints for users, payments, and applications
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { toUserDTO, toKycDTO, toReferralUserDTO, toPaymentDTO } from '../utils/mappers';
import { flattenApplication, ApplicationType } from '../services/applications.service';
import { AuthedRequest } from '../middleware/auth';

const ALL_APPLICATION_TYPES: ApplicationType[] = [
  'loan',
  'credit_card',
  'job_posting',
  'job_application',
  'lawyer_registration',
  'legal_case',
  'doctor_registration',
  'patient_consultancy',
  'travel_voucher',
  'visa_application',
  'scholarship_unlock',
  'course_enrollment',
  'copy_trading_investment',
  'voucher_application',
  'charity_request',
  'entertainment_request',
];

export const adminListUsers = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  let query = supabase.from('users').select('*', { count: 'exact' }).order('created_at', { ascending: false });
  if (search) {
    query = query.or(`full_name.ilike.%${search}%,email.ilike.%${search}%`);
  }

  const { data: users, error, count } = await query.range(from, to);
  if (error) throw new ApiError(500, error.message);

  const userIds = (users || []).map((u) => u.id);
  const { data: kycRows } = userIds.length
    ? await supabase.from('kyc_records').select('*').in('user_id', userIds)
    : { data: [] as any[] };
  const kycByUser = new Map((kycRows || []).map((k) => [k.user_id, k]));

  const total = count || 0;
  res.json({
    users: (users || []).map((u) => {
      const kyc = kycByUser.get(u.id);
      // The admin KYC screen (app/admin/kyc-user) drives its approve/reject
      // buttons off `kyc.id` and renders the document download links off
      // `kyc.idDocument` / `kyc.proofOfAddress` / `kyc.paymentScreenshot`, so
      // the whole record goes out here, not just the status summary.
      return {
        ...toUserDTO(u),
        kyc: toKycDTO(kyc),
      };
    }),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export const adminGetUserById = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.params.userId;
  const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!user) throw ApiError.notFound('User not found');

  const [{ data: kyc }, { data: applications }, { data: payments }, { data: referrals }] = await Promise.all([
    supabase.from('kyc_records').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('applications').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('payments').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('users').select('id, full_name, email, created_at, balance, kyc_completed').eq('referred_by', userId),
  ]);

  const applicationsByType: Record<string, any[]> = {};
  for (const type of ALL_APPLICATION_TYPES) applicationsByType[type] = [];
  for (const row of applications || []) {
    (applicationsByType[row.type] ||= []).push(flattenApplication(row));
  }

  res.json({
    user: toUserDTO(user),
    kyc: toKycDTO(kyc),
    applications: applicationsByType,
    // The admin user-detail tabs read camelCase (`payment.createdAt`,
    // `referral.fullName`, `referral.kycCompleted`), so map the raw rows.
    payments: (payments || []).map(toPaymentDTO),
    referrals: (referrals || []).map(toReferralUserDTO),
  });
});

const ACTIVITY_FETCH_CAP = 300;

export const adminDashboardActivities = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const category = typeof req.query.category === 'string' ? req.query.category : '';
  const search = typeof req.query.search === 'string' ? req.query.search.trim().toLowerCase() : '';

  const activities: Array<{
    id: string;
    category: string;
    title: string;
    status: string;
    user: { fullName: string; email: string } | null;
    createdAt: string;
    data: Record<string, any>;
  }> = [];

  if (!category || category === 'kyc') {
    const { data: kycRows } = await supabase
      .from('kyc_records')
      .select('*, users(full_name, email)')
      .eq('status', 'pending')
      .order('submitted_at', { ascending: false })
      .limit(ACTIVITY_FETCH_CAP);

    for (const row of kycRows || []) {
      activities.push({
        id: row.id,
        category: 'kyc',
        title: `KYC verification — ${row.users?.full_name ?? 'Unknown user'}`,
        status: row.status,
        user: row.users ? { fullName: row.users.full_name, email: row.users.email } : null,
        createdAt: row.submitted_at || row.created_at,
        data: { paymentStatus: row.payment_status },
      });
    }
  }

  const typesToFetch = category && category !== 'kyc' ? [category as ApplicationType] : ALL_APPLICATION_TYPES;
  if (!category || category !== 'kyc') {
    const { data: appRows } = await supabase
      .from('applications')
      .select('*, users(full_name, email)')
      .in('type', typesToFetch)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(ACTIVITY_FETCH_CAP);

    for (const row of appRows || []) {
      activities.push({
        id: row.id,
        category: row.type,
        title: `${row.type.replace(/_/g, ' ')} — ${row.users?.full_name ?? row.payload?.fullName ?? 'Unknown'}`,
        status: row.status,
        user: row.users ? { fullName: row.users.full_name, email: row.users.email } : null,
        createdAt: row.created_at,
        data: row.payload,
      });
    }
  }

  let filtered = activities;
  if (search) {
    filtered = filtered.filter(
      (a) =>
        a.title.toLowerCase().includes(search) ||
        a.user?.fullName.toLowerCase().includes(search) ||
        a.user?.email.toLowerCase().includes(search)
    );
  }
  filtered.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const stats: Record<string, number> = { totalPending: filtered.length };
  for (const activity of filtered) {
    stats[activity.category] = (stats[activity.category] || 0) + 1;
  }

  const total = filtered.length;
  const from = (page - 1) * limit;
  const pageItems = filtered.slice(from, from + limit);

  res.json({
    activities: pageItems,
    stats,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  });
});
