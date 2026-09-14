import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { upload } from '../middleware/upload';
import {
  postJob,
  getMyJobPosts,
  adminListJobPosts,
  adminUpdateJobPost,
  adminDeleteJobPost,
  applyForJob,
  getMyJobApplications,
  adminListJobApplications,
  adminUpdateJobApplicationStatus,
  adminDeleteJobApplication,
} from '../controllers/jobs.controller';

const router = Router();

router.post('/jobs/post', requireAuth, postJob);
router.get('/jobs/posts/my', requireAuth, getMyJobPosts);
router.get('/admin/jobs/posts', requireAuth, requireAdmin, adminListJobPosts);
router.put('/admin/jobs/posts/:postId', requireAuth, requireAdmin, adminUpdateJobPost);
router.delete('/admin/jobs/posts/:postId', requireAuth, requireAdmin, adminDeleteJobPost);

router.post('/jobs/apply', requireAuth, upload.single('resume'), applyForJob);
router.get('/jobs/applications/my', requireAuth, getMyJobApplications);
router.get('/admin/jobs/applications', requireAuth, requireAdmin, adminListJobApplications);
router.put(
  '/admin/jobs/applications/:applicationId/status',
  requireAuth,
  requireAdmin,
  adminUpdateJobApplicationStatus
);
router.delete('/admin/jobs/applications/:applicationId', requireAuth, requireAdmin, adminDeleteJobApplication);

export default router;
