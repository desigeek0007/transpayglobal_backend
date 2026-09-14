import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { getDashboard } from '../controllers/portal.controller';

const router = Router();

router.get('/portal/dashboard', requireAuth, getDashboard);

export default router;
