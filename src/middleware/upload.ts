import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB, matches frontend's stated limit

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

export function multerErrorHandler(err: any, _req: any, _res: any, next: any) {
  if (err instanceof multer.MulterError && err.code === 'LIMIT_FILE_SIZE') {
    return next(new ApiError(413, 'File too large. Maximum file size is 20MB.'));
  }
  next(err);
}
