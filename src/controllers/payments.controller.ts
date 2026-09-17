// User credit/debit payment requests with screenshot proof upload
import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthedRequest } from '../middleware/auth';
import { toPaymentDTO as mapPaymentRow } from '../utils/mappers';
import { uploadFile } from '../utils/storage';
import { STORAGE_BUCKETS } from '../config/supabase';


// Ledger rows are created by the "Credit Balance" flow (the dashboard's credit
// modal on web, CreditBalanceModal on native): the user transfers off-platform
// and uploads a screenshot as proof. The row lands as pending/pending and only
// touches users.balance once an admin flips it to completed via
// PUT /api/admin/payments/:paymentId — that's where the balance math lives.

const creditSchema = z.object({
  amount: z.coerce.number().positive('Amount must be greater than 0'),
  type: z.enum(['credit', 'debit']).default('credit'),
  description: z.string().optional(),
});

export const createCreditRequest = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = creditSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const screenshot = req.file;
  if (!screenshot) throw ApiError.badRequest('paymentScreenshot is required');

  const userId = req.user!.id;
  const screenshotUrl = await uploadFile(STORAGE_BUCKETS.uploads, screenshot, `${userId}/payment-screenshots`);

  const { data: created, error } = await supabase
    .from('payments')
    .insert({
      user_id: userId,
      amount: parsed.data.amount,
      type: parsed.data.type,
      description: parsed.data.description ?? 'Balance credit request',
      payment_screenshot_url: screenshotUrl,
      payment_status: 'pending',
      status: 'pending',
    })
    .select('*, users(email, full_name, balance)')
    .single();

  if (error || !created) throw new ApiError(500, error?.message || 'Failed to record payment');

  res.status(201).json({
    message: 'Payment information submitted successfully. Your balance will be updated after verification.',
    payment: mapPaymentRow(created),
  });
});

export const getMyPayments = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('user_id', req.user!.id)
    .order('created_at', { ascending: false });
  if (error) throw new ApiError(500, error.message);
  res.json({ payments: (data || []).map(mapPaymentRow) });
});

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
