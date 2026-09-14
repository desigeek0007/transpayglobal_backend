import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
} from '../controllers/auth.controller';

const router = Router();

router.post('/auth/register', register);
router.post('/auth/login', login);
router.get('/auth/me', requireAuth, getMe);
router.put('/auth/profile', requireAuth, updateProfile);
router.put('/auth/change-password', requireAuth, changePassword);

export default router;
