// Server-side reCAPTCHA verification protecting the contact form
import { Request, Response } from 'express';

// Mirrors the existing app/api/route.ts contract exactly: POST /api/ with a
// reCAPTCHA token, verified server-side so the secret never reaches the browser.
export async function verifyRecaptcha(req: Request, res: Response) {
  const token = req.body?.token;
  if (!token) {
    return res.status(405).json({ message: 'Token not found' });
  }

  const secret = process.env.RECAPTCHA_SECRET_KEY;
  if (!secret) {
    console.error('RECAPTCHA_SECRET_KEY is not configured');
    return res.status(500).json({ message: 'Internal Server Error' });
  }

  try {
    const params = new URLSearchParams({ secret, response: token });
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const result = (await verifyRes.json()) as { success?: boolean };

    if (!result.success) {
      return res.status(405).json({ message: 'Failed to verify' });
    }

    res.status(200).json({ message: 'Success' });
  } catch (err) {
    console.error('reCAPTCHA verification failed:', err);
    res.status(500).json({ message: 'Internal Server Error' });
  }
}
