import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  unlockScholarships,
  getMyUnlocks,
  adminListUnlocks,
  adminListUnlocksForUser,
  adminDeleteUnlock,
} from '../controllers/scholarships.controller';

const router = Router();

const unlockFiles = upload.fields([
  { name: 'transcripts', maxCount: 1 },
  { name: 'certificates', maxCount: 1 },
  { name: 'languageTestResults', maxCount: 1 },
  { name: 'recommendationLetter', maxCount: 1 },
  { name: 'statementOfPurpose', maxCount: 1 },
]);

router.post('/scholarships/unlock', requireAuth, unlockFiles, unlockScholarships);
router.get('/scholarships/unlocks/my', requireAuth, getMyUnlocks);
router.get('/admin/scholarships/unlocks', requireAuth, requireAdmin, adminListUnlocks);
router.get('/admin/scholarships/unlocks/user/:userId', requireAuth, requireAdmin, adminListUnlocksForUser);
router.delete('/admin/scholarships/unlocks/:unlockId', requireAuth, requireAdmin, adminDeleteUnlock);

export default router;
