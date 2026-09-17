// Voucher application submission, listing, and status for users
import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthedRequest } from '../middleware/auth';
import { createApplication, listApplicationsForUser } from '../services/applications.service';

function mapVoucherApplication(row: any) {
  return {
    id: row.id,
    voucherId: row.payload.voucherId,
    voucherCode: row.payload.voucherCode,
    partnerName: row.payload.partnerName,
    status: row.status,
    appliedAt: row.created_at,
    reviewedAt: row.status !== 'pending' ? row.updated_at : undefined,
  };
}

const applySchema = z.object({
  voucherId: z.number(),
  voucherCode: z.string().min(1),
  partnerName: z.string().min(1),
});

export const applyForVoucher = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = applySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const application = await createApplication(req.user!.id, 'voucher_application', parsed.data);
  res.status(201).json({ message: 'Voucher application submitted', applicationId: application.id, status: application.status });
});

export const getMyVoucherApplications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'voucher_application');
  res.json(rows.map(mapVoucherApplication));
});

export const getVoucherApplicationStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('applications')
    .select('*')
    .eq('user_id', req.user!.id)
    .eq('type', 'voucher_application')
    .eq('payload->>voucherId', req.params.voucherId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw new ApiError(500, error.message);
  if (!data) throw ApiError.notFound('No application found for this voucher');

  res.json(mapVoucherApplication(data));
});
