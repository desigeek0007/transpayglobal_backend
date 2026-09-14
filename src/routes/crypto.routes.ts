import { Router } from 'express';
import { getCryptoPrices } from '../controllers/crypto.controller';

const router = Router();

router.get('/crypto', getCryptoPrices);

export default router;
