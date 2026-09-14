import { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../utils/jwt';
import { ApiError } from '../utils/ApiError';
import { supabase } from '../config/supabase';

export interface AuthedRequest extends Request {
  user?: {
    id: string;
    email: string;
    role: string;
  };
}

export async function requireAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw ApiError.unauthorized('Access token required');
    }

    const token = header.slice('Bearer '.length);
    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    const { data: user, error } = await supabase
      .from('users')
      .select('id, email, role')
      .eq('id', payload.userId)
      .single();

    if (error || !user) {
      throw ApiError.unauthorized('Invalid or expired token');
    }

    req.user = { id: user.id, email: user.email, role: user.role };
    next();
  } catch (err) {
    next(err);
  }
}

// Attaches req.user when a valid bearer token is present, but never rejects
// the request — for endpoints the frontend calls with an optional token.
export async function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) return next();

  try {
    const payload = verifyToken(header.slice('Bearer '.length));
    const { data: user } = await supabase.from('users').select('id, email, role').eq('id', payload.userId).single();
    if (user) req.user = { id: user.id, email: user.email, role: user.role };
  } catch {
    // ignore invalid/expired token — this endpoint doesn't require auth
  }
  next();
}

export function requireAdmin(req: AuthedRequest, _res: Response, next: NextFunction) {
  if (!req.user || req.user.role !== 'admin') {
    return next(ApiError.forbidden('Admin access required'));
  }
  next();
}
