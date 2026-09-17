// Registration, login, and token refresh for users
import { Response } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { signToken } from '../utils/jwt';
import { generateReferralCode } from '../utils/referralCode';
import { toUserDTO, toReferralUserDTO } from '../utils/mappers';
import { AuthedRequest } from '../middleware/auth';

const registerSchema = z.object({
  fullName: z.string().trim().min(2, 'Full name is required'),
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  referralCode: z.string().trim().optional(),
});

async function generateUniqueReferralCode(): Promise<string> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const code = generateReferralCode();
    const { data } = await supabase.from('users').select('id').eq('referral_code', code).maybeSingle();
    if (!data) return code;
  }
  throw new ApiError(500, 'Could not generate a unique referral code, please try again');
}

export const register = asyncHandler(async (req, res: Response) => {
  const parsed = registerSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');
  }
  const { fullName, email, password, referralCode } = parsed.data;

  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();
  if (existing) {
    throw ApiError.conflict('An account with this email already exists');
  }

  let referredBy: string | null = null;
  if (referralCode) {
    const { data: referrer } = await supabase
      .from('users')
      .select('id')
      .eq('referral_code', referralCode.trim().toUpperCase())
      .maybeSingle();
    if (referrer) referredBy = referrer.id;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const newReferralCode = await generateUniqueReferralCode();

  const { data: user, error } = await supabase
    .from('users')
    .insert({
      full_name: fullName,
      email,
      password_hash: passwordHash,
      referral_code: newReferralCode,
      referred_by: referredBy,
    })
    .select()
    .single();

  if (error || !user) {
    throw new ApiError(500, error?.message || 'Failed to create account');
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.status(201).json({
    message: 'Account created successfully',
    token,
    user: toUserDTO(user),
  });
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const login = asyncHandler(async (req, res: Response) => {
  const parsed = loginSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');
  }
  const { email, password } = parsed.data;

  const { data: user } = await supabase.from('users').select('*').eq('email', email).maybeSingle();
  if (!user) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    throw new ApiError(401, 'Invalid email or password');
  }

  const token = signToken({ userId: user.id, email: user.email, role: user.role });

  res.json({
    message: 'Login successful',
    token,
    user: toUserDTO(user),
  });
});

export const getMe = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { data: user, error } = await supabase.from('users').select('*').eq('id', req.user!.id).single();
  if (error || !user) throw ApiError.notFound('User not found');
  res.json(toUserDTO(user));
});

const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  walletAddress: z.string().trim().nullable().optional(),
  bankCountry: z.string().trim().nullable().optional(),
  bankCity: z.string().trim().nullable().optional(),
  bankName: z.string().trim().nullable().optional(),
  bankIban: z.string().trim().nullable().optional(),
});

export const updateProfile = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = updateProfileSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');
  }
  const input = parsed.data;

  if (input.email) {
    const { data: existing } = await supabase
      .from('users')
      .select('id')
      .eq('email', input.email)
      .neq('id', req.user!.id)
      .maybeSingle();
    if (existing) throw ApiError.conflict('An account with this email already exists');
  }

  const update: Record<string, any> = {};
  if (input.fullName !== undefined) update.full_name = input.fullName;
  if (input.email !== undefined) update.email = input.email;
  if (input.walletAddress !== undefined) update.wallet_address = input.walletAddress;
  if (input.bankCountry !== undefined) update.bank_country = input.bankCountry;
  if (input.bankCity !== undefined) update.bank_city = input.bankCity;
  if (input.bankName !== undefined) update.bank_name = input.bankName;
  if (input.bankIban !== undefined) update.bank_iban = input.bankIban;
  update.updated_at = new Date().toISOString();

  const { data: user, error } = await supabase
    .from('users')
    .update(update)
    .eq('id', req.user!.id)
    .select()
    .single();

  if (error || !user) throw new ApiError(500, error?.message || 'Failed to update profile');
  res.json(toUserDTO(user));
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'New password must be at least 6 characters'),
});

export const changePassword = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = changePasswordSchema.safeParse(req.body);
  if (!parsed.success) {
    throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');
  }
  const { currentPassword, newPassword } = parsed.data;

  const { data: user, error } = await supabase
    .from('users')
    .select('id, password_hash')
    .eq('id', req.user!.id)
    .single();
  if (error || !user) throw ApiError.notFound('User not found');

  const valid = await bcrypt.compare(currentPassword, user.password_hash);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  const newHash = await bcrypt.hash(newPassword, 10);
  await supabase
    .from('users')
    .update({ password_hash: newHash, updated_at: new Date().toISOString() })
    .eq('id', req.user!.id);

  res.json({ message: 'Password changed successfully' });
});

export const getReferrals = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const { data: referrals, error } = await supabase
    .from('users')
    .select('id, full_name, email, created_at, balance, kyc_completed')
    .eq('referred_by', req.user!.id)
    .order('created_at', { ascending: false });

  if (error) throw new ApiError(500, error.message);
  res.json({ referrals: (referrals || []).map(toReferralUserDTO) });
});
