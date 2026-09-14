import { Router } from 'express';
import { submitEntertainmentRequest } from '../controllers/entertainment.controller';

const router = Router();

router.post('/entertainment', submitEntertainmentRequest);

export default router;
