import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  submitKyc,
  getKycStatus,
  getKycSteps,
  saveKycPartial,
  updateOwnPaymentStatus,
  adminListKyc,
  adminUpdateKycStatus,
  adminUpdateKycPaymentStatus,
} from '../controllers/kyc.controller';

const router = Router();

// `paymentScreenshot` belongs here too: step 3 of the KYC wizard posts the
// membership payment proof to /api/kyc/save. Leaving it out of the field list
// made multer reject the whole request with LIMIT_UNEXPECTED_FILE.
const kycFileFields = upload.fields([
  { name: 'idDocument', maxCount: 1 },
  { name: 'proofOfAddress', maxCount: 1 },
  { name: 'paymentScreenshot', maxCount: 1 },
]);

router.post('/kyc/submit', requireAuth, kycFileFields, submitKyc);
router.get('/kyc/status', requireAuth, getKycStatus);
router.get('/kyc/steps', requireAuth, getKycSteps);
router.post('/kyc/save', requireAuth, kycFileFields, saveKycPartial);
router.post('/kyc/payment-status', requireAuth, updateOwnPaymentStatus);

router.get('/admin/kyc', requireAuth, requireAdmin, adminListKyc);
router.put('/admin/kyc/:kycId/status', requireAuth, requireAdmin, adminUpdateKycStatus);
router.put('/admin/kyc/:kycId/payment-status', requireAuth, requireAdmin, adminUpdateKycPaymentStatus);

export default router;
