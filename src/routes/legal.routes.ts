import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  registerLawyer,
  registerCase,
  getMyLawyers,
  getMyCases,
  adminListLawyers,
  adminListCases,
  adminUpdateLawyer,
  adminDeleteLawyer,
  adminUpdateCase,
  adminDeleteCase,
} from '../controllers/legal.controller';

const router = Router();

const lawyerFiles = upload.fields([
  { name: 'documents' },
  { name: 'paymentScreenshot', maxCount: 1 },
]);

router.post('/legal/lawyer/register', requireAuth, lawyerFiles, registerLawyer);
router.post('/legal/case/register', requireAuth, upload.array('documents'), registerCase);
router.get('/legal/lawyers/my', requireAuth, getMyLawyers);
router.get('/legal/cases/my', requireAuth, getMyCases);

router.get('/admin/legal/lawyers', requireAuth, requireAdmin, adminListLawyers);
router.get('/admin/legal/cases', requireAuth, requireAdmin, adminListCases);
router.put('/admin/legal/lawyers/:lawyerId', requireAuth, requireAdmin, adminUpdateLawyer);
router.delete('/admin/legal/lawyers/:lawyerId', requireAuth, requireAdmin, adminDeleteLawyer);
router.put('/admin/legal/cases/:caseId', requireAuth, requireAdmin, adminUpdateCase);
router.delete('/admin/legal/cases/:caseId', requireAuth, requireAdmin, adminDeleteCase);

export default router;
