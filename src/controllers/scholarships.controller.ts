// Scholarship unlock and course enrollment application flows
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

const unlockSchema = z.object({
  email: z.string().email(),
  highestDegree: z.string().optional(),
  currentEducationLevel: z.string().optional(),
  fieldOfStudy: z.string().optional(),
  gpa: z.string().optional(),
  languageProficiency: z.string().optional(),
  testType: z.string().optional(),
  englishTestScore: z.string().optional(),
});

type UnlockFiles = {
  transcripts?: Express.Multer.File[];
  certificates?: Express.Multer.File[];
  languageTestResults?: Express.Multer.File[];
  recommendationLetter?: Express.Multer.File[];
  statementOfPurpose?: Express.Multer.File[];
};

export const unlockScholarships = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = unlockSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const files = req.files as UnlockFiles;

  async function uploadNamed(field: keyof UnlockFiles) {
    const file = files?.[field]?.[0];
    return file ? uploadFile(STORAGE_BUCKETS.uploads, file, `scholarships/${userId}`) : undefined;
  }

  const [transcripts, certificates, languageTestResults, recommendationLetter, statementOfPurpose] =
    await Promise.all([
      uploadNamed('transcripts'),
      uploadNamed('certificates'),
      uploadNamed('languageTestResults'),
      uploadNamed('recommendationLetter'),
      uploadNamed('statementOfPurpose'),
    ]);

  const payload = {
    ...parsed.data,
    educationHistory: parseJsonField<any[]>(req.body.educationHistory, []),
    transcripts,
    certificates,
    languageTestResults,
    recommendationLetter,
    statementOfPurpose,
  };

  const application = await createApplication(userId, 'scholarship_unlock', payload);
  res
    .status(201)
    .json({ message: 'Scholarship directory unlock request submitted', unlock: flattenApplication(application) });
});

export const getMyUnlocks = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'scholarship_unlock');
  res.json(rows.map(flattenApplication));
});

export const adminListUnlocks = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('scholarship_unlock', { page, limit });
  res.json({ unlocks: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const adminListUnlocksForUser = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const rows = await listApplicationsForUser(req.params.userId, 'scholarship_unlock');
  res.json({ unlocks: rows.map(flattenApplication), total: rows.length, page, limit, totalPages: 1 });
});

export const adminDeleteUnlock = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.unlockId);
  res.json({ message: 'Scholarship unlock record deleted' });
});
