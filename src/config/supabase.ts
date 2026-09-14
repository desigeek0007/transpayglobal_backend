import { createClient } from '@supabase/supabase-js';
import { env } from './env';

// Server-side client using the secret key. This bypasses Row Level Security,
// so every access rule (ownership, admin-only, etc.) MUST be enforced in
// application code (see src/middleware/auth.ts and each controller).
export const supabase = createClient(env.supabaseUrl, env.supabaseSecretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

export const STORAGE_BUCKETS = {
  kycDocuments: 'kyc-documents',
  resumes: 'job-resumes',
  uploads: 'misc-uploads',
} as const;
