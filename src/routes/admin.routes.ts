import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { adminListUsers, adminGetUserById, adminDashboardActivities } from '../controllers/admin.controller';

const router = Router();

router.get('/admin/users', requireAuth, requireAdmin, adminListUsers);
router.get('/admin/users/:userId', requireAuth, requireAdmin, adminGetUserById);
router.get('/admin/dashboard/activities', requireAuth, requireAdmin, adminDashboardActivities);

export default router;
