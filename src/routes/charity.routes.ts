import { Router } from 'express';
import { submitCharityRequest } from '../controllers/charity.controller';

const router = Router();

router.post('/charity', submitCharityRequest);

export default router;
