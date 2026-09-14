import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { AuthedRequest } from '../middleware/auth';

const schema = z.object({
  formType: z.string().min(1),
  formData: z.record(z.any()).default({}),
});

// Fire-and-forget: the frontend never reads this response and swallows any
// error, so we log the submission for the admin to review and always
// respond 200 rather than risk surfacing a failure the UI can't handle.
export const logFormSubmission = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = schema.safeParse(req.body);
  if (parsed.success) {
    const { error } = await supabase.from('form_submissions').insert({
      user_id: req.user?.id ?? null,
      form_type: parsed.data.formType,
      form_data: parsed.data.formData,
    });
    if (error) console.error('Failed to log form submission:', error.message);
  }
  res.json({ message: 'Notification received' });
});

export const adminListFormSubmissions = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('form_submissions')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) throw new ApiError(500, error.message);
  res.json({ submissions: data || [] });
});
