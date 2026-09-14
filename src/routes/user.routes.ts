import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getReferrals } from '../controllers/auth.controller';

const router = Router();

router.get('/user/referrals', requireAuth, getReferrals);

export default router;
