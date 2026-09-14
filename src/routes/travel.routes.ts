import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  applyForHotelsFlightsVoucher,
  applyForVisa,
  getMyVouchers,
  getMyVisas,
  adminListVouchers,
  adminListVisas,
  adminUpdateVoucher,
  adminDeleteVoucher,
  adminUpdateVisa,
  adminDeleteVisa,
} from '../controllers/travel.controller';

const router = Router();

router.post(
  '/travel/hotels-flights-voucher',
  requireAuth,
  upload.array('documents'),
  applyForHotelsFlightsVoucher
);
router.get('/travel/hotels-flights-vouchers/my', requireAuth, getMyVouchers);
router.get('/admin/travel/hotels-flights-vouchers', requireAuth, requireAdmin, adminListVouchers);
router.put('/admin/travel/hotels-flights-vouchers/:voucherId', requireAuth, requireAdmin, adminUpdateVoucher);
router.delete('/admin/travel/hotels-flights-vouchers/:voucherId', requireAuth, requireAdmin, adminDeleteVoucher);

const visaFiles = upload.fields([
  { name: 'documents' },
  { name: 'paymentScreenshot', maxCount: 1 },
]);

router.post('/travel/visa-application', requireAuth, visaFiles, applyForVisa);
router.get('/travel/visa-applications/my', requireAuth, getMyVisas);
router.get('/admin/travel/visa-applications', requireAuth, requireAdmin, adminListVisas);
router.put('/admin/travel/visa-applications/:visaId', requireAuth, requireAdmin, adminUpdateVisa);
router.delete('/admin/travel/visa-applications/:visaId', requireAuth, requireAdmin, adminDeleteVisa);

export default router;
