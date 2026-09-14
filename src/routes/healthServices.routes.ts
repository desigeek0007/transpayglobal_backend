import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  registerDoctor,
  registerConsultancy,
  getMyDoctors,
  getMyConsultancies,
  adminListDoctors,
  adminListConsultancies,
  adminUpdateDoctor,
  adminDeleteDoctor,
  adminUpdateConsultancy,
  adminDeleteConsultancy,
} from '../controllers/healthServices.controller';

const router = Router();

const doctorFiles = upload.fields([
  { name: 'documents' },
  { name: 'paymentScreenshot', maxCount: 1 },
]);

router.post('/health/doctor/register', requireAuth, doctorFiles, registerDoctor);
router.post('/health/consultancy/register', requireAuth, upload.array('documents'), registerConsultancy);
router.get('/health/doctors/my', requireAuth, getMyDoctors);
router.get('/health/consultancies/my', requireAuth, getMyConsultancies);

router.get('/admin/health/doctors', requireAuth, requireAdmin, adminListDoctors);
router.put('/admin/health/doctors/:doctorId', requireAuth, requireAdmin, adminUpdateDoctor);
router.delete('/admin/health/doctors/:doctorId', requireAuth, requireAdmin, adminDeleteDoctor);
router.get('/admin/health/consultancies', requireAuth, requireAdmin, adminListConsultancies);
router.put('/admin/health/consultancies/:consultancyId', requireAuth, requireAdmin, adminUpdateConsultancy);
router.delete('/admin/health/consultancies/:consultancyId', requireAuth, requireAdmin, adminDeleteConsultancy);

export default router;
