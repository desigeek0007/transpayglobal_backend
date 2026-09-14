import { Router } from 'express';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth';
import { logFormSubmission, adminListFormSubmissions } from '../controllers/notifications.controller';

const router = Router();

router.post('/notifications/form-submission', optionalAuth, logFormSubmission);

// Not part of the documented frontend contract, but real email delivery has
// no SMTP credentials configured — this read endpoint is the pragmatic
// substitute so "notify admin" submissions are actually visible somewhere.
router.get('/admin/notifications/form-submissions', requireAuth, requireAdmin, adminListFormSubmissions);

export default router;
