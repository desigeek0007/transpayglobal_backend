import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { submitCharityRequest, getMyCharityRequests } from '../controllers/charity.controller';

const router = Router();

router.post('/charity', requireAuth, submitCharityRequest);
router.get('/charity/my', requireAuth, getMyCharityRequests);

export default router;
