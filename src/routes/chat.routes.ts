import { Router } from 'express';
import { optionalAuth, requireAuth, requireAdmin } from '../middleware/auth';
import {
  sendChatMessage,
  getMyChatMessages,
  submitChatContact,
  adminListChatUsers,
  adminGetChatMessages,
  adminSendChatResponse,
} from '../controllers/chat.controller';

const router = Router();

// Visitor side — `optionalAuth` because the widget is usable both by a
// logged-in user (bearer token) and by a guest who identifies themselves with
// the email from the contact form.
router.post('/chat', optionalAuth, sendChatMessage);
router.get('/chat/messages', optionalAuth, getMyChatMessages);
router.post('/chat/contact', optionalAuth, submitChatContact);

// Admin inbox. These paths are /api/admin/chat-<x> (hyphen, not a nested
// segment) because that is what AdminChatGPT.tsx calls.
router.get('/admin/chat-users', requireAuth, requireAdmin, adminListChatUsers);
router.get('/admin/chat-messages/:userId', requireAuth, requireAdmin, adminGetChatMessages);
router.post('/admin/chat-response', requireAuth, requireAdmin, adminSendChatResponse);

export default router;
