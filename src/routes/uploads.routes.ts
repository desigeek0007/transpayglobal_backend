import { Router } from 'express';
import { supabase, STORAGE_BUCKETS } from '../config/supabase';
import { ApiError } from '../utils/ApiError';

// Both frontends build every file link as `${API_BASE_URL}/uploads/<value>`,
// where <value> is whatever this API stored for that document
// (see the KYC wizard previews and the admin `downloadFile` helper).
//
// Files live in Supabase Storage, not on this server's disk, and
// utils/storage.ts stores a long-lived signed URL. So this route exists purely
// to resolve that stored value to something the browser can fetch:
//
//   * an absolute URL  -> redirect straight to it
//   * `bucket/path`    -> sign it now and redirect to the signed URL
//   * a bare path      -> assume the KYC documents bucket
//
// Without it, every `/uploads/...` link 404s and no document preview or
// download works anywhere in the app.

const router = Router();

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour — links are followed immediately
const KNOWN_BUCKETS = new Set<string>(Object.values(STORAGE_BUCKETS));

/**
 * Express collapses the `//` in an embedded `https://...`, so a stored absolute
 * URL arrives as `https:/host/...`. Put the slash back.
 */
function repairAbsoluteUrl(value: string): string | null {
  const match = /^(https?):\/{1,2}(.+)$/i.exec(value);
  if (!match) return null;
  return `${match[1]}://${match[2]}`;
}

router.get(/^\/(.+)$/, async (req, res, next) => {
  try {
    // Read the tail off originalUrl rather than req.params so the query string
    // of a signed URL (?token=...) survives intact.
    const prefix = '/uploads/';
    const index = req.originalUrl.indexOf(prefix);
    const raw = index === -1 ? '' : req.originalUrl.slice(index + prefix.length);
    if (!raw) throw ApiError.badRequest('Missing file reference');

    const value = decodeURIComponent(raw);

    const absolute = repairAbsoluteUrl(value);
    if (absolute) return res.redirect(302, absolute);

    const segments = value.split('/').filter(Boolean);
    const bucket = segments.length > 1 && KNOWN_BUCKETS.has(segments[0]) ? segments.shift()! : STORAGE_BUCKETS.kycDocuments;
    const path = segments.join('/');
    if (!path) throw ApiError.badRequest('Missing file reference');

    const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
    if (error || !data?.signedUrl) throw ApiError.notFound('File not found');

    return res.redirect(302, data.signedUrl);
  } catch (err) {
    next(err);
  }
});

export default router;
