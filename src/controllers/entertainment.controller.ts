import { Request, Response } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../utils/asyncHandler';
import { createApplication } from '../services/applications.service';

const PLATFORMS = ['Netflix', 'Amazon Prime Video', 'Apple TV+', 'Disney+', 'Hulu', 'Max', 'YouTube Premium'] as const;

const schema = z.object({
  fullName: z.string().trim().min(1, 'Full name is required'),
  email: z.string().trim().email('A valid email is required'),
  phone: z.string().trim().min(1, 'Phone number is required'),
  country: z.string().trim().min(1, 'Country is required'),
  preferredPlatform: z.enum(PLATFORMS, { errorMap: () => ({ message: 'Invalid preferred platform' }) }),
  notes: z.string().trim().max(500).optional(),
});

export const submitEntertainmentRequest = asyncHandler(async (req: Request, res: Response) => {
  const parsed = schema.safeParse({
    ...req.body,
    notes: typeof req.body?.notes === 'string' ? req.body.notes.slice(0, 500) : req.body?.notes,
  });
  if (!parsed.success) {
    return res.status(400).json({ message: parsed.error.errors[0]?.message || 'Invalid input' });
  }

  await createApplication(null, 'entertainment_request', parsed.data);

  res.status(200).json({ ok: true, message: 'Entertainment Hub request received.', data: parsed.data });
});
