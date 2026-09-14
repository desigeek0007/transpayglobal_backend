import { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';

const DEFAULT_IDS = 'bitcoin,ethereum,binancecoin,cardano,solana,ripple';
const CACHE_TTL_MS = 60_000;
const cache = new Map<string, { expiresAt: number; body: any }>();

export const getCryptoPrices = asyncHandler(async (req: Request, res: Response) => {
  const ids = typeof req.query.ids === 'string' && req.query.ids ? req.query.ids : DEFAULT_IDS;
  const vsCurrencies = typeof req.query.vs_currencies === 'string' && req.query.vs_currencies ? req.query.vs_currencies : 'usd';
  const include24hrChange = req.query.include_24hr_change !== 'false';

  const cacheKey = `${ids}|${vsCurrencies}|${include24hrChange}`;
  const cached = cache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    res.set('Cache-Control', 'public, s-maxage=60');
    return res.json(cached.body);
  }

  const url = new URL('https://api.coingecko.com/api/v3/simple/price');
  url.searchParams.set('ids', ids);
  url.searchParams.set('vs_currencies', vsCurrencies);
  url.searchParams.set('include_24hr_change', String(include24hrChange));

  try {
    const upstream = await fetch(url.toString());
    if (!upstream.ok) {
      throw new Error(`CoinGecko responded with ${upstream.status}`);
    }
    const body = await upstream.json();
    cache.set(cacheKey, { expiresAt: Date.now() + CACHE_TTL_MS, body });
    res.set('Cache-Control', 'public, s-maxage=60');
    res.json(body);
  } catch (err: any) {
    res.status(500).json({ error: 'crypto_fetch_failed', message: err.message || 'Failed to fetch crypto prices' });
  }
});
