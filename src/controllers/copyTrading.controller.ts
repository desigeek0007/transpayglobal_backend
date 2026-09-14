import { Response } from 'express';
import { z } from 'zod';
import { STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadFile } from '../utils/storage';
import { AuthedRequest } from '../middleware/auth';
import {
  createApplication,
  listApplicationsForUser,
  listApplicationsAdmin,
  updateApplication,
  deleteApplication,
  flattenApplication,
} from '../services/applications.service';

function pagination(req: AuthedRequest) {
  return { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 };
}

const investSchema = z.object({
  traderId: z.string().optional(),
  traderName: z.string().optional(),
  traderSpecialty: z.string().optional(),
  amount: z.string().min(1),
  riskLevel: z.string().min(1),
  investmentDuration: z.string().min(1),
  autoTrade: z.string().optional(),
  maxLoss: z.string().optional(),
  paymentMethod: z.enum(['crypto', 'card']),
  cardNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  cardholderName: z.string().optional(),
});

export const invest = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = investSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');
  const { cardNumber, expiryDate, cardholderName, ...rest } = parsed.data;

  const userId = req.user!.id;
  const paymentScreenshotFile = req.file as Express.Multer.File | undefined;
  const paymentScreenshot = paymentScreenshotFile
    ? await uploadFile(STORAGE_BUCKETS.uploads, paymentScreenshotFile, `copy-trading/${userId}`)
    : undefined;

  // Never persist raw PAN/CVV, even for this demo flow — no real payment
  // processor is integrated (see COPY_TRADING_FLOW.md "Next Steps"), so the
  // card fields the frontend collects should never reach durable storage.
  const cardLast4 = cardNumber ? cardNumber.replace(/\s+/g, '').slice(-4) : undefined;
  const amountNum = Number(rest.amount) || 0;

  const payload = {
    ...rest,
    autoTrade: rest.autoTrade === 'true',
    currentAmount: amountNum,
    profit: 0,
    cardLast4,
    expiryDate: rest.paymentMethod === 'card' ? expiryDate : undefined,
    cardholderName: rest.paymentMethod === 'card' ? cardholderName : undefined,
    paymentScreenshot,
  };

  const application = await createApplication(userId, 'copy_trading_investment', payload, {
    paymentStatus: req.body.paymentStatus || 'pending',
  });
  res.status(201).json({ message: 'Investment submitted successfully', investment: flattenApplication(application) });
});

export const getMyInvestments = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'copy_trading_investment');
  res.json({ investments: rows.map(flattenApplication) });
});

export const adminListInvestments = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('copy_trading_investment', { page, limit });
  res.json({ investments: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.investmentId, parsed.data);
  res.json({ message: 'Investment updated', investment: flattenApplication(updated) });
});

export const adminDeleteInvestment = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.investmentId);
  res.json({ message: 'Investment deleted' });
});
