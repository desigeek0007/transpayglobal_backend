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

type LawyerFiles = { documents?: Express.Multer.File[]; paymentScreenshot?: Express.Multer.File[] };

const lawyerSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  barLicenseNumber: z.string().min(1),
  licenseExpiryDate: z.string().min(1),
  jurisdiction: z.string().min(1),
  yearsOfExperience: z.string().optional(),
  currentPractice: z.string().optional(),
  firmName: z.string().optional(),
  officeAddress: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().optional(),
  consultationType: z.string().optional(),
});

export const registerLawyer = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = lawyerSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const files = req.files as LawyerFiles;
  const documents = await uploadFiles(STORAGE_BUCKETS.uploads, files?.documents, `lawyers/${userId}`);
  const paymentScreenshotFile = files?.paymentScreenshot?.[0];
  const paymentScreenshot = paymentScreenshotFile
    ? await uploadFile(STORAGE_BUCKETS.uploads, paymentScreenshotFile, `lawyers/${userId}`)
    : undefined;

  const payload = {
    ...parsed.data,
    specialties: parseJsonField<string[]>(req.body.specialties, []),
    languages: parseJsonField<string[]>(req.body.languages, []),
    documents,
    paymentScreenshot,
  };

  const application = await createApplication(userId, 'lawyer_registration', payload, {
    paymentStatus: req.body.paymentStatus || 'pending',
  });
  res.status(201).json({ message: 'Lawyer registration submitted successfully', lawyer: flattenApplication(application) });
});

const caseSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  alternatePhone: z.string().optional(),
  dateOfBirth: z.string().optional(),
  nationality: z.string().min(1),
  caseTitle: z.string().min(1),
  caseCategory: z.string().min(1),
  caseDescription: z.string().min(1),
  urgency: z.string().min(1),
  jurisdiction: z.string().optional(),
  city: z.string().min(1),
  country: z.string().min(1),
  budget: z.string().optional(),
  preferredConsultationType: z.string().optional(),
  privacyLevel: z.string().optional(),
  hasPriorCases: z.string().optional(),
  priorCasesDescription: z.string().optional(),
});

export const registerCase = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = caseSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const documents = await uploadFiles(
    STORAGE_BUCKETS.uploads,
    req.files as Express.Multer.File[] | undefined,
    `legal-cases/${userId}`
  );

  const payload = { ...parsed.data, hasPriorCases: parsed.data.hasPriorCases === 'true', documents };
  const application = await createApplication(userId, 'legal_case', payload);
  res.status(201).json({ message: 'Case registered successfully', case: flattenApplication(application) });
});

export const getMyLawyers = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'lawyer_registration');
  res.json({ lawyers: rows.map(flattenApplication) });
});

export const getMyCases = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'legal_case');
  res.json({ cases: rows.map(flattenApplication) });
});

export const adminListLawyers = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('lawyer_registration', { page, limit });
  res.json({ lawyers: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const adminListCases = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('legal_case', { page, limit });
  res.json({ cases: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateLawyer = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.lawyerId, parsed.data);
  res.json({ message: 'Lawyer registration updated', lawyer: flattenApplication(updated) });
});

export const adminDeleteLawyer = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.lawyerId);
  res.json({ message: 'Lawyer registration deleted' });
});

const statusOnlySchema = z.object({ status: z.string().min(1) });

export const adminUpdateCase = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = statusOnlySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('status is required');
  const updated = await updateApplication(req.params.caseId, { status: parsed.data.status });
  res.json({ message: 'Case status updated', case: flattenApplication(updated) });
});

export const adminDeleteCase = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.caseId);
  res.json({ message: 'Case deleted' });
});
