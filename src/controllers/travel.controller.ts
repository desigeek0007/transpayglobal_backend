// Travel voucher and visa application flows with file uploads
import { Response } from 'express';
import { z } from 'zod';
import { STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadFile, uploadFiles } from '../utils/storage';
import { AuthedRequest } from '../middleware/auth';
import {
  createApplication,
  listApplicationsForUser,
  listApplicationsAdmin,
  updateApplication,
  deleteApplication,
  flattenApplication,
} from '../services/applications.service';

function parseJsonField<T>(raw: unknown, fallback: T): T {
  if (raw === undefined || raw === null || raw === '') return fallback;
  if (typeof raw !== 'string') return raw as T;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function pagination(req: AuthedRequest) {
  return { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 };
}

const voucherSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  departureCity: z.string().optional(),
  destinationCity: z.string().min(1),
  destinationCountry: z.string().min(1),
  travelType: z.string().min(1),
  checkInDate: z.string().min(1),
  checkOutDate: z.string().min(1),
  adults: z.string().optional(),
  children: z.string().optional(),
  rooms: z.string().optional(),
});

export const applyForHotelsFlightsVoucher = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = voucherSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const documents = await uploadFiles(
    STORAGE_BUCKETS.uploads,
    req.files as Express.Multer.File[] | undefined,
    `travel-vouchers/${userId}`
  );

  const payload = {
    ...parsed.data,
    selectedOffers: parseJsonField<any[]>(req.body.selectedOffers, []),
    documents,
  };

  const application = await createApplication(userId, 'travel_voucher', payload);
  res.status(201).json({ message: 'Voucher application submitted successfully', voucher: flattenApplication(application) });
});

const visaSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  passportNumber: z.string().min(1),
  passportExpiryDate: z.string().min(1),
  passportIssueDate: z.string().min(1),
  visaType: z.string().min(1),
  travelDate: z.string().min(1),
  returnDate: z.string().optional(),
  purposeOfVisit: z.string().min(1),
  currentAddress: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().optional(),
  occupation: z.string().optional(),
});

type VisaFiles = { documents?: Express.Multer.File[]; paymentScreenshot?: Express.Multer.File[] };

export const applyForVisa = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = visaSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const files = req.files as VisaFiles;
  const documents = await uploadFiles(STORAGE_BUCKETS.uploads, files?.documents, `visa-applications/${userId}`);
  const paymentScreenshotFile = files?.paymentScreenshot?.[0];
  const paymentScreenshot = paymentScreenshotFile
    ? await uploadFile(STORAGE_BUCKETS.uploads, paymentScreenshotFile, `visa-applications/${userId}`)
    : undefined;

  const application = await createApplication(userId, 'visa_application', {
    ...parsed.data,
    documents,
    paymentScreenshot,
  });
  res.status(201).json({ message: 'Visa application submitted successfully', visa: flattenApplication(application) });
});

export const getMyVouchers = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'travel_voucher');
  res.json({ vouchers: rows.map(flattenApplication) });
});

export const getMyVisas = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'visa_application');
  res.json({ visas: rows.map(flattenApplication) });
});

export const adminListVouchers = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('travel_voucher', { page, limit });
  res.json({ vouchers: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const adminListVisas = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('visa_application', { page, limit });
  res.json({ visas: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateVoucher = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.voucherId, parsed.data);
  res.json({ message: 'Voucher application updated', voucher: flattenApplication(updated) });
});

export const adminDeleteVoucher = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.voucherId);
  res.json({ message: 'Voucher application deleted' });
});

export const adminUpdateVisa = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.visaId, parsed.data);
  res.json({ message: 'Visa application updated', visa: flattenApplication(updated) });
});

export const adminDeleteVisa = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.visaId);
  res.json({ message: 'Visa application deleted' });
});
