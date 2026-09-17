// Validates and persists charity funding requests
import { Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthedRequest } from '../middleware/auth';
import { createApplication, listApplicationsForUser, flattenApplication } from '../services/applications.service';

// Replicates the validation from the existing app/api/charity/route.ts mock,
// but actually persists the request instead of just echoing it back.
const schema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('A valid email is required'),
  phone: z.string().trim().min(1, 'Phone number is required'),
  country: z.string().trim().min(1, 'Country is required'),
  description: z.string().trim().min(30, 'Please provide at least 30 characters describing your request'),
  causeType: z.string().trim().min(1, 'Cause type is required'),
  amount: z
    .number()
    .finite('Amount must be a valid number')
    .gt(0, 'Amount must be greater than 0')
    .lte(50000, 'Amount must not exceed 50,000'),
});

export const submitCharityRequest = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  const { fullName, email, phone, country, amount, causeType } = parsed.data;
  const application = await createApplication(req.user!.id, 'charity_request', parsed.data);

  res.status(200).json({
    ok: true,
    message: 'Charity request received.',
    data: { fullName, email, phone, country, amount, causeType },
    request: flattenApplication(application),
  });
});

export const getMyCharityRequests = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const rows = await listApplicationsForUser(req.user!.id, 'charity_request');
  res.json({ requests: rows.map(flattenApplication) });
});
