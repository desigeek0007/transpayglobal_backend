import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { adminListPayments, adminUpdatePayment, adminDeletePayment } from '../controllers/payments.controller';

const router = Router();

router.get('/admin/payments', requireAuth, requireAdmin, adminListPayments);
router.put('/admin/payments/:paymentId', requireAuth, requireAdmin, adminUpdatePayment);
router.delete('/admin/payments/:paymentId', requireAuth, requireAdmin, adminDeletePayment);

export default router;
