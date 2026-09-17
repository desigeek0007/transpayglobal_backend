// Loan application submission, review, and admin management
import { Response } from 'express';
import { z } from 'zod';
import { STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { uploadFiles } from '../utils/storage';
import { AuthedRequest } from '../middleware/auth';
import {
  createApplication,
  listApplicationsForUser,
  listApplicationsAdmin,
  updateApplication,
  deleteApplication,
  flattenApplication,
} from '../services/applications.service';

const loanSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  currentAddress: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().min(1),
  loanAmount: z.string().min(1),
  loanPurpose: z.string().min(1),
  loanTier: z.string().min(1),
  securityDeposit: z.string().optional(),
  repaymentOption: z.string().min(1),
  occupation: z.string().min(1),
  monthlyIncome: z.string().min(1),
  employerName: z.string().optional(),
  employmentDuration: z.string().optional(),
});

function mapLoanBody(body: Record<string, any>) {
  return {
    fullName: body.fullName,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    nationality: body.nationality,
    address: body.currentAddress,
    city: body.city,
    country: body.country,
    zipCode: body.zipCode,
    loanAmount: body.loanAmount,
    loanPurpose: body.loanPurpose,
    loanType: body.loanTier,
    securityDeposit: body.securityDeposit,
    repaymentTerm: body.repaymentOption,
    employmentStatus: body.occupation,
    monthlyIncome: body.monthlyIncome,
    employerName: body.employerName,
    employmentDuration: body.employmentDuration,
  };
}

export const applyForLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = loanSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const documents = await uploadFiles(
    STORAGE_BUCKETS.uploads,
    req.files as Express.Multer.File[] | undefined,
    `loans/${userId}`
  );

  const application = await createApplication(userId, 'loan', { ...mapLoanBody(parsed.data), documents });
  res.status(201).json({ message: 'Loan application submitted successfully', loan: flattenApplication(application) });
});

const creditCardSchema = z.object({
  fullName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().min(1),
  dateOfBirth: z.string().min(1),
  nationality: z.string().min(1),
  currentAddress: z.string().min(1),
  city: z.string().min(1),
  country: z.string().min(1),
  zipCode: z.string().min(1),
  cardTier: z.string().min(1),
  cardName: z.string().min(1),
  cardAddress: z.string().min(1),
  occupation: z.string().min(1),
  monthlyIncome: z.string().min(1),
  employerName: z.string().optional(),
  employmentDuration: z.string().optional(),
});

function mapCreditCardBody(body: Record<string, any>) {
  return {
    fullName: body.fullName,
    email: body.email,
    phone: body.phone,
    dateOfBirth: body.dateOfBirth,
    nationality: body.nationality,
    address: body.currentAddress,
    city: body.city,
    country: body.country,
    zipCode: body.zipCode,
    cardTier: body.cardTier,
    cardName: body.cardName,
    cardAddress: body.cardAddress,
    employmentStatus: body.occupation,
    monthlyIncome: body.monthlyIncome,
    employerName: body.employerName,
    employmentDuration: body.employmentDuration,
  };
}

export const applyForCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = creditCardSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const userId = req.user!.id;
  const documents = await uploadFiles(
    STORAGE_BUCKETS.uploads,
    req.files as Express.Multer.File[] | undefined,
    `credit-cards/${userId}`
  );

  const application = await createApplication(userId, 'credit_card', { ...mapCreditCardBody(parsed.data), documents });
  res
    .status(201)
    .json({ message: 'Credit card application submitted successfully', creditCard: flattenApplication(application) });
});

function pagination(req: AuthedRequest) {
  return { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 10 };
}

export const getMyLoans = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'loan');
  res.json({ loans: rows.map(flattenApplication) });
});

export const getMyCreditCards = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'credit_card');
  res.json({ creditCards: rows.map(flattenApplication) });
});

export const adminListLoans = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('loan', { page, limit });
  res.json({ loans: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

export const adminListCreditCards = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { page, limit } = pagination(req);
  const { rows, total } = await listApplicationsAdmin('credit_card', { page, limit });
  res.json({ creditCards: rows.map(flattenApplication), total, page, limit, totalPages: Math.ceil(total / limit) });
});

const adminUpdateSchema = z.object({ status: z.string().optional(), paymentStatus: z.string().optional() });

export const adminUpdateLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.loanId, parsed.data);
  res.json({ message: 'Loan updated', loan: flattenApplication(updated) });
});

export const adminDeleteLoan = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.loanId);
  res.json({ message: 'Loan deleted' });
});

export const adminUpdateCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminUpdateSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest('Invalid input');
  const updated = await updateApplication(req.params.creditCardId, parsed.data);
  res.json({ message: 'Credit card application updated', creditCard: flattenApplication(updated) });
});

export const adminDeleteCreditCard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  await deleteApplication(req.params.creditCardId);
  res.json({ message: 'Credit card application deleted' });
});
