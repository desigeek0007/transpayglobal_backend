import { Router } from 'express';
import { supabase } from '../config/supabase';

const router = Router();

router.get('/', async (_req, res) => {
  const startedAt = Date.now();
  const { error } = await supabase.from('users').select('id', { count: 'exact', head: true });

  res.json({
    status: error ? 'degraded' : 'ok',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    database: error ? 'unreachable' : 'connected',
    latencyMs: Date.now() - startedAt,
  });
});

export default router;
