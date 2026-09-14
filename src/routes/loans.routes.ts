import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  applyForLoan,
  applyForCreditCard,
  getMyLoans,
  getMyCreditCards,
  adminListLoans,
  adminListCreditCards,
  adminUpdateLoan,
  adminDeleteLoan,
  adminUpdateCreditCard,
  adminDeleteCreditCard,
} from '../controllers/loans.controller';

const router = Router();

router.post('/loans/apply', requireAuth, upload.array('documents'), applyForLoan);
router.get('/loans/my', requireAuth, getMyLoans);
router.get('/admin/loans', requireAuth, requireAdmin, adminListLoans);
router.put('/admin/loans/:loanId', requireAuth, requireAdmin, adminUpdateLoan);
router.delete('/admin/loans/:loanId', requireAuth, requireAdmin, adminDeleteLoan);

router.post('/credit-cards/apply', requireAuth, upload.array('documents'), applyForCreditCard);
router.get('/credit-cards/my', requireAuth, getMyCreditCards);
router.get('/admin/credit-cards', requireAuth, requireAdmin, adminListCreditCards);
router.put('/admin/credit-cards/:creditCardId', requireAuth, requireAdmin, adminUpdateCreditCard);
router.delete('/admin/credit-cards/:creditCardId', requireAuth, requireAdmin, adminDeleteCreditCard);

export default router;
