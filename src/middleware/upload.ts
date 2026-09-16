import multer from 'multer';
import { ApiError } from '../utils/ApiError';

const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20MB, matches frontend's stated limit

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_SIZE },
});

export function multerErrorHandler(err: any, _req: any, _res: any, next: any) {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return next(new ApiError(413, 'File too large. Maximum file size is 20MB.'));
    }
    // Uploading under a field name the route did not declare. Surfacing this as
    // a 400 naming the field turns an opaque 500 into something actionable —
    // it is how a missing field in an `upload.fields([...])` list shows up.
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return next(ApiError.badRequest(`Unexpected file field: ${err.field}`));
    }
    return next(ApiError.badRequest(err.message));
  }
  next(err);
}
