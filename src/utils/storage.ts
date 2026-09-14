import { randomUUID } from 'crypto';
import { supabase } from '../config/supabase';
import { ApiError } from './ApiError';

export async function uploadFile(
  bucket: string,
  file: Express.Multer.File,
  folder: string
): Promise<string> {
  const ext = file.originalname.includes('.') ? file.originalname.split('.').pop() : 'bin';
  const path = `${folder}/${randomUUID()}.${ext}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file.buffer, {
    contentType: file.mimetype,
    upsert: false,
  });

  if (error) {
    throw new ApiError(500, `File upload failed: ${error.message}`);
  }

  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24 * 365);
  return data?.signedUrl ?? path;
}

export async function uploadFiles(
  bucket: string,
  files: Express.Multer.File[] | undefined,
  folder: string
): Promise<string[]> {
  if (!files || files.length === 0) return [];
  return Promise.all(files.map((file) => uploadFile(bucket, file, folder)));
}
