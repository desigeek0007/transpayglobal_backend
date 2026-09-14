import { Router } from 'express';
import { verifyRecaptcha } from '../controllers/misc.controller';

const router = Router();

router.post('/', verifyRecaptcha);

export default router;
