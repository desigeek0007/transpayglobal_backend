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

type DoctorFiles = { documents?: Express.Multer.File[]; paymentScreenshot?: Express.Multer.File[] };

const doctorSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  medicalLicenseNumber: z.string().min(1),
  licenseAuthority: z.string().min(1),
  licenseExpiryDate: z.string().min(1),
  medicalSpecialty: z.string().min(1),
  yearsOfExperience: z.string().optional(),
  currentPractice: z.string().optional(),
  clinicName: z.string().optional(),
  officeAddress: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().optional(),
  availableHours: z.string().optional(),
  consultationFee: z.string().optional(),
});

export const registerDoctor = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = doctorSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const files = req.files as DoctorFiles;
  const documents = await uploadFiles(STORAGE_BUCKETS.uploads, files?.documents, `doctors/${userId}`);
  const paymentScreenshotFile = files?.paymentScreenshot?.[0];
  const paymentScreenshot = paymentScreenshotFile
    ? await uploadFile(STORAGE_BUCKETS.uploads, paymentScreenshotFile, `doctors/${userId}`)
    : undefined;

  const payload = {
    ...parsed.data,
    languages: parseJsonField<string[]>(req.body.languages, []),
    consultationTypes: parseJsonField<string[]>(req.body.consultationTypes, []),
    documents,
    paymentScreenshot,
  };

  const application = await createApplication(userId, 'doctor_registration', payload);
  res.status(201).json({ message: 'Doctor registration submitted successfully', doctor: flattenApplication(application) });
});

const consultancySchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().optional(),
  gender: z.string().optional(),
  nationality: z.string().optional(),
  healthIssue: z.string().min(1),
  symptoms: z.string().optional(),
  urgency: z.enum(['low', 'medium', 'high']),
  currentMedications: z.string().optional(),
  allergies: z.string().optional(),
  language: z.string().optional(),
  consultationType: z.string().optional(),
  preferredTime: z.string().optional(),
});

export const registerConsultancy = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = consultancySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const documents = await uploadFiles(
    STORAGE_BUCKETS.uploads,
    req.files as Express.Multer.File[] | undefined,
    `consultancies/${userId}`
  );

  const { healthIssue, language, consultationType, ...rest } = parsed.data;
  const payload = {
    ...rest,
    medicalConcern: healthIssue,
    medicalCategory: healthIssue,
    preferredLanguage: language,
    preferredConsultationType: consultationType,
    documents,
  };

  const application = await createApplication(userId, 'patient_consultancy', payload);
  res
    .status(201)
    .json({ message: 'Consultation request submitted successfully', consultancy: flattenApplication(application) });
});

export const getMyDoctors = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'doctor_registration');
  res.json({ doctors: rows.map(flattenApplication) });
});

export const getMyConsultancies = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'patient_consultancy');
  res.json({ consultancies: rows.map(flattenApplication) });
});

export const adminListDoctors = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('doctor_registration', { page, limit });
  res.json({ doctors: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const adminListConsultancies = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('patient_consultancy', { page, limit });
  res.json({
    consultancies: rows.map(flattenApplication),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateDoctor = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.doctorId, parsed.data);
  res.json({ message: 'Doctor registration updated', doctor: flattenApplication(updated) });
});

export const adminDeleteDoctor = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.doctorId);
  res.json({ message: 'Doctor registration deleted' });
});

const statusOnlySchema = z.object({ status: z.string().min(1) });

export const adminUpdateConsultancy = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = statusOnlySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('status is required');
  const updated = await updateApplication(req.params.consultancyId, { status: parsed.data.status });
  res.json({ message: 'Consultancy status updated', consultancy: flattenApplication(updated) });
});

export const adminDeleteConsultancy = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.consultancyId);
  res.json({ message: 'Consultancy request deleted' });
});
