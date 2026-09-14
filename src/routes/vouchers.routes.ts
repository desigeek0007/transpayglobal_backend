import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  applyForVoucher,
  getMyVoucherApplications,
  getVoucherApplicationStatus,
} from '../controllers/vouchers.controller';

const router = Router();

router.post('/vouchers/apply', requireAuth, applyForVoucher);
router.get('/vouchers/my-applications', requireAuth, getMyVoucherApplications);
router.get('/vouchers/application-status/:voucherId', requireAuth, getVoucherApplicationStatus);

export default router;
