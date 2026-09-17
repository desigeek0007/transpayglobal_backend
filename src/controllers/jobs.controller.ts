// Job posting and job application flows with resume uploads
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

// ---------------------------------------------------------------------------
// Job postings
// ---------------------------------------------------------------------------

const jobPostSchema = z.object({
  companyName: z.string().min(1),
  contactPerson: z.string().min(1),
  email: z.string().email(),
  phoneNumber: z.string().min(1),
  jobTitle: z.string().min(1),
  jobDescription: z.string().min(1),
  jobType: z.string().min(1),
  workType: z.enum(['remote', 'hybrid', 'on-site']),
  location: z.string().min(1),
  salaryRange: z.string().optional(),
  requiredExperience: z.string().optional(),
  requiredEducation: z.string().optional(),
  requiredSkills: z.array(z.string()).default([]),
  preferredSkills: z.array(z.string()).default([]),
  benefits: z.array(z.string()).default([]),
  applicationDeadline: z.string().nullable().optional(),
  applicationMethod: z.string().optional(),
  applicationLink: z.string().optional(),
  companyWebsite: z.string().optional(),
  status: z.string().optional(),
});

export const postJob = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = jobPostSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const application = await createApplication(req.user!.id, 'job_posting', parsed.data, {
    status: parsed.data.status || 'pending',
  });
  res.status(201).json({ message: 'Job posted successfully', post: flattenApplication(application) });
});

export const getMyJobPosts = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'job_posting');
  res.json(rows.map(flattenApplication));
});

export const adminListJobPosts = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('job_posting', { page, limit });
  res.json({ posts: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateJobPost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.postId, parsed.data);
  res.json({ message: 'Job post updated', post: flattenApplication(updated) });
});

export const adminDeleteJobPost = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.postId);
  res.json({ message: 'Job post deleted' });
});

// ---------------------------------------------------------------------------
// Job applications
// ---------------------------------------------------------------------------

export const applyForJob = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const body = req.body as Record<string, any>;
  if (!body.jobTitle || !body.company) throw ApiError.badRequest('jobTitle and company are required');

  const resumeFile = (req.file as Express.Multer.File | undefined) ?? undefined;
  if (!resumeFile) throw ApiError.badRequest('resume file is required');

  const userId = req.user!.id;
  const resumeUrl = await uploadFile(STORAGE_BUCKETS.resumes, resumeFile, `job-applications/${userId}`);

  const payload = {
    jobTitle: body.jobTitle,
    company: body.company,
    personalInfo: parseJsonField(body.personalInfo, {}),
    educationalBackground: parseJsonField(body.educationalBackground, []),
    professionalExperience: parseJsonField(body.professionalExperience, []),
    travelHistory: parseJsonField(body.travelHistory, []),
    jobPreference: parseJsonField(body.jobPreference, {}),
    skills: body.skills || '',
    languageProficiency: parseJsonField(body.languageProficiency, {}),
    references: parseJsonField(body.references, []),
    declaration: parseJsonField(body.declaration, {}),
    resume: resumeUrl,
    resumeFileName: body.resumeFileName || resumeFile.originalname,
    resumeFileSize: body.resumeFileSize || String(resumeFile.size),
  };

  const application = await createApplication(userId, 'job_application', payload);
  res.status(201).json({ message: 'Job application submitted successfully', application: flattenApplication(application) });
});

export const getMyJobApplications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'job_application');
  res.json(rows.map(flattenApplication));
});

export const adminListJobApplications = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('job_application', { page, limit });
  res.json({
    applications: rows.map(flattenApplication),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

const statusOnlySchema = z.object({ status: z.string().min(1) });

export const adminUpdateJobApplicationStatus = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = statusOnlySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('status is required');
  const updated = await updateApplication(req.params.applicationId, { status: parsed.data.status });
  res.json({ message: 'Application status updated', application: flattenApplication(updated) });
});

export const adminDeleteJobApplication = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.applicationId);
  res.json({ message: 'Job application deleted' });
});
