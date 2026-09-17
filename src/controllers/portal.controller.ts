// Logged-in user dashboard with KYC gate and activity stats
import { Response } from 'express';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { toUserDTO } from '../utils/mappers';
import { AuthedRequest } from '../middleware/auth';

export const getDashboard = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const userId = req.user!.id;

  const { data: user, error } = await supabase.from('users').select('*').eq('id', userId).single();
  if (error || !user) throw ApiError.notFound('User not found');

  if (!user.kyc_completed) {
    throw ApiError.forbidden('Please complete KYC verification to access your dashboard');
  }

  const { data: kyc } = await supabase.from('kyc_records').select('status').eq('user_id', userId).maybeSingle();

  const [{ count: bookings }, { count: payments }, { count: stays }] = await Promise.all([
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .in('type', ['travel_voucher', 'visa_application']),
    supabase.from('payments').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase
      .from('applications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('type', 'travel_voucher')
      .eq('status', 'approved'),
  ]);

  res.json({
    message: 'Dashboard loaded successfully',
    user: { ...toUserDTO(user), kycStatus: kyc?.status ?? 'not_submitted', memberSince: user.created_at },
    data: {
      stats: {
        bookings: bookings || 0,
        payments: payments || 0,
        stays: stays || 0,
      },
    },
  });
});
