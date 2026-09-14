/**
 * One-time setup: creates the private Supabase Storage buckets the backend
 * needs (KYC documents, resumes, misc uploads). Safe to re-run.
 */
import dotenv from 'dotenv';
dotenv.config();

import { supabase, STORAGE_BUCKETS } from '../src/config/supabase';

async function ensureBucket(id: string) {
  const { data: existing } = await supabase.storage.getBucket(id);
  if (existing) {
    console.log(`Bucket "${id}" already exists.`);
    return;
  }
  const { error } = await supabase.storage.createBucket(id, { public: false });
  if (error) {
    console.error(`Failed to create bucket "${id}":`, error.message);
    process.exitCode = 1;
    return;
  }
  console.log(`Created bucket "${id}".`);
}

async function main() {
  for (const bucket of Object.values(STORAGE_BUCKETS)) {
    await ensureBucket(bucket);
  }
}

main();
