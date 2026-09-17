// Shared persistence for all admin-reviewed application flows
// Generic persistence for the many "submit a form, get reviewed by an admin"
// flows across the platform (loan applications, job postings/applications,
// lawyer/case registrations, doctor registrations, patient consultancies,
// travel vouchers, visa applications, scholarship unlocks, course
// enrollments, copy-trading investments, voucher applications, charity and
// entertainment requests). Each domain gets its own validation schema and
// response shape in its controller, but they all share one `applications`
// table keyed by `type` so we're not hand-rolling sixteen near-identical
// CRUD stacks.
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';

export type ApplicationType =
  | 'loan'
  | 'credit_card'
  | 'job_posting'
  | 'job_application'
  | 'lawyer_registration'
  | 'legal_case'
  | 'doctor_registration'
  | 'patient_consultancy'
  | 'travel_voucher'
  | 'visa_application'
  | 'scholarship_unlock'
  | 'course_enrollment'
  | 'copy_trading_investment'
  | 'voucher_application'
  | 'charity_request'
  | 'entertainment_request';

export interface ApplicationRow {
  id: string;
  user_id: string | null;
  type: ApplicationType;
  status: string;
  payment_status: string | null;
  price: number | null;
  payload: Record<string, any>;
  admin_notes: string | null;
  created_at: string;
  updated_at: string;
  users?: { full_name: string; email: string; balance: number; referral_code: string; created_at: string } | null;
}

export async function createApplication(
  userId: string | null,
  type: ApplicationType,
  payload: Record<string, any>,
  opts: { status?: string; paymentStatus?: string | null; price?: number | null } = {}
): Promise<ApplicationRow> {
  const { data, error } = await supabase
    .from('applications')
    .insert({
      user_id: userId,
      type,
      payload,
      status: opts.status ?? 'pending',
      payment_status: opts.paymentStatus ?? null,
      price: opts.price ?? null,
    })
    .select()
    .single();

  if (error || !data) throw new ApiError(500, error?.message || 'Failed to save submission');
  return data;
}

export async function listApplicationsForUser(userId: string, type: ApplicationType): Promise<ApplicationRow[]> {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', userId)
    .eq('type', type)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  return data || [];
}

export async function getApplicationById(id: string): Promise<ApplicationRow | null> {
  const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle();
  if (error) throw new ApiError(500, error.message);
  return data;
}

export async function listApplicationsAdmin(
  type: ApplicationType,
  { page = 1, limit = 10, status }: { page?: number; limit?: number; status?: string }
): Promise<{ rows: ApplicationRow[]; total: number }> {
  let query = supabase
    .from('applications')
    .select('*, users(full_name, email, balance, referral_code, created_at)', { count: 'exact' })
    .eq('type', type)
    .order('created_at', { ascending: false });

  if (status) query = query.eq('status', status);

  const safeLimit = Math.min(Math.max(limit, 1), 100);
  const from = (Math.max(page, 1) - 1) * safeLimit;
  const to = from + safeLimit - 1;
  const { data, error, count } = await query.range(from, to);

  if (error) throw new ApiError(500, error.message);
  return { rows: data || [], total: count || 0 };
}

export async function updateApplication(
  id: string,
  updates: { status?: string; paymentStatus?: string; adminNotes?: string; payload?: Record<string, any> }
): Promise<ApplicationRow> {
  const update: Record<string, any> = { updated_at: new Date().toISOString() };
  if (updates.status !== undefined) update.status = updates.status;
  if (updates.paymentStatus !== undefined) update.payment_status = updates.paymentStatus;
  if (updates.adminNotes !== undefined) update.admin_notes = updates.adminNotes;
  if (updates.payload !== undefined) update.payload = updates.payload;

  const { data, error } = await supabase.from('applications').update(update).eq('id', id).select().single();
  if (error || !data) throw new ApiError(500, error?.message || 'Failed to update record');
  return data;
}

export async function deleteApplication(id: string): Promise<void> {
  const { error } = await supabase.from('applications').delete().eq('id', id);
  if (error) throw new ApiError(500, error.message);
}

// Flattens a row back into the shape the frontend's *Record interfaces expect:
// domain fields spread at the top level (as they were submitted) alongside
// the universal id/status/paymentStatus/createdAt/user fields.
export function flattenApplication(row: ApplicationRow) {
  return {
    id: row.id,
    ...row.payload,
    price: row.price ?? row.payload?.price,
    paymentStatus: row.payment_status ?? row.payload?.paymentStatus,
    status: row.status,
    createdAt: row.created_at,
    user: toApplicantUserDTO(row),
  };
}

export function toApplicantUserDTO(row: ApplicationRow) {
  if (!row.users) return undefined;
  return {
    id: row.user_id,
    email: row.users.email,
    fullName: row.users.full_name,
    referralCode: row.users.referral_code,
    balance: Number(row.users.balance ?? 0),
    createdAt: row.users.created_at,
  };
}
