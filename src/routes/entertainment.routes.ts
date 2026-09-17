import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { submitEntertainmentRequest, getMyEntertainmentRequests } from '../controllers/entertainment.controller';

const router = Router();

router.post('/entertainment', requireAuth, submitEntertainmentRequest);
router.get('/entertainment/my', requireAuth, getMyEntertainmentRequests);

export default router;
