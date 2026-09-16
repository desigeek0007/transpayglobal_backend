import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  createCreditRequest,
  getMyPayments,
  adminListPayments,
  adminUpdatePayment,
  adminDeletePayment,
} from '../controllers/payments.controller';

const router = Router();

router.post('/payments/credit', requireAuth, upload.single('paymentScreenshot'), createCreditRequest);
router.get('/payments/my', requireAuth, getMyPayments);

router.get('/admin/payments', requireAuth, requireAdmin, adminListPayments);
router.put('/admin/payments/:paymentId', requireAuth, requireAdmin, adminUpdatePayment);
router.delete('/admin/payments/:paymentId', requireAuth, requireAdmin, adminDeletePayment);

export default router;
