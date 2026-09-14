import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthedRequest } from '../middleware/auth';

// Note: the documented frontend contract (lib/api/payments.ts) only lists,
// updates and deletes ledger rows — there is no public "create payment"
// endpoint. Rows are expected to be inserted by whatever internal process
// needs to log a balance change (e.g. a future referral-bonus credit or
// manual admin adjustment done directly in Supabase); this controller
// implements exactly the three documented endpoints, including the balance
// math the frontend's PaymentRecord shape (previousBalance/newBalance/
// processedAt) implies happens on approval.

function mapPaymentRow(row: any) {
  return {
    id: row.id,
    userId: row.user_id,
    user: row.users
      ? { id: row.user_id, email: row.users.email, fullName: row.users.full_name, balance: Number(row.users.balance) }
      : null,
    amount: Number(row.amount),
    type: row.type,
    paymentScreenshot: row.payment_screenshot_url,
    paymentStatus: row.payment_status,
    status: row.status,
    previousBalance: row.previous_balance !== null ? Number(row.previous_balance) : null,
    newBalance: row.new_balance !== null ? Number(row.new_balance) : null,
    processedAt: row.processed_at,
    createdAt: row.created_at,
  };
}

export const adminListPayments = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const page = Number(req.query.page) || 1;
  const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 100);
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const {
    data,
    error,
    count,
  } = await supabase
    .from('payments')
    .select('*, users(email, full_name, balance)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error) throw new ApiError(500, error.message);
  const total = count || 0;
  res.json({ payments: (data || []).map(mapPaymentRow), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const updateSchema = z.object({
  status: z.enum(['pending', 'completed']).optional(),
  paymentStatus: z.enum(['pending', 'approved']).optional(),
});

export const adminUpdatePayment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const { data: payment, error } = await supabase
    .from('payments')
    .select('*')
    .eq('id', req.params.paymentId)
    .maybeSingle();
  if (error) throw new ApiError(500, error.message);
  if (!payment) throw ApiError.notFound('Payment not found');

  const update: Record<string, any> = {};
  if (parsed.data.status !== undefined) update.status = parsed.data.status;
  if (parsed.data.paymentStatus !== undefined) update.payment_status = parsed.data.paymentStatus;

  const willComplete = update.status === 'completed' && payment.status !== 'completed' && !payment.processed_at;

  if (willComplete) {
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('balance')
      .eq('id', payment.user_id)
      .single();
    if (userError || !user) throw new ApiError(500, userError?.message || 'User not found for this payment');

    const previousBalance = Number(user.balance);
    const delta = payment.type === 'credit' ? Number(payment.amount) : -Number(payment.amount);
    const newBalance = previousBalance + delta;

    const { error: balanceError } = await supabase
      .from('users')
      .update({ balance: newBalance })
      .eq('id', payment.user_id);
    if (balanceError) throw new ApiError(500, balanceError.message);

    update.previous_balance = previousBalance;
    update.new_balance = newBalance;
    update.processed_at = new Date().toISOString();
  }

  const { data: updated, error: updateError } = await supabase
    .from('payments')
    .update(update)
    .eq('id', req.params.paymentId)
    .select('*, users(email, full_name, balance)')
    .single();
  if (updateError || !updated) throw new ApiError(500, updateError?.message || 'Failed to update payment');

  res.json({ message: 'Payment updated', payment: mapPaymentRow(updated) });
});

export const adminDeletePayment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { error } = await supabase.from('payments').delete().eq('id', req.params.paymentId);
  if (error) throw new ApiError(500, error.message);
  res.json({ message: 'Payment deleted' });
});
