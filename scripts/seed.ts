/**
 * Seeds a first admin account so you can log in to /app/admin immediately.
 * Reads ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME from env, with sane defaults.
 * Safe to re-run: it upgrades an existing user to admin instead of duplicating.
 */
import dotenv from 'dotenv';
dotenv.config();

import bcrypt from 'bcryptjs';
import { supabase } from '../src/config/supabase';
import { generateReferralCode } from '../src/utils/referralCode';

async function main() {
  const email = (process.env.ADMIN_EMAIL || 'admin@transpayglobal.org').toLowerCase();
  const password = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
  const fullName = process.env.ADMIN_NAME || 'TransPay Global Admin';

  const { data: existing } = await supabase.from('users').select('id').eq('email', email).maybeSingle();

  if (existing) {
    await supabase.from('users').update({ role: 'admin' }).eq('id', existing.id);
    console.log(`Existing user ${email} promoted to admin.`);
    return;
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const { error } = await supabase.from('users').insert({
    full_name: fullName,
    email,
    password_hash: passwordHash,
    referral_code: generateReferralCode(),
    role: 'admin',
    kyc_completed: true,
  });

  if (error) {
    console.error('Failed to seed admin user:', error.message);
    process.exitCode = 1;
    return;
  }

  console.log(`Admin user created: ${email} / ${password}`);
  console.log('Log in, then change this password immediately.');
}

main();
