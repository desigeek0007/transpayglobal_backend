import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  invest,
  getMyInvestments,
  adminListInvestments,
  adminUpdateInvestment,
  adminDeleteInvestment,
} from '../controllers/copyTrading.controller';

const router = Router();

router.post('/copy-trading/invest', requireAuth, upload.single('paymentScreenshot'), invest);
router.get('/copy-trading/investments/my', requireAuth, getMyInvestments);
router.get('/admin/copy-trading/investments', requireAuth, requireAdmin, adminListInvestments);
router.put('/admin/copy-trading/investments/:investmentId', requireAuth, requireAdmin, adminUpdateInvestment);
router.delete('/admin/copy-trading/investments/:investmentId', requireAuth, requireAdmin, adminDeleteInvestment);

export default router;
