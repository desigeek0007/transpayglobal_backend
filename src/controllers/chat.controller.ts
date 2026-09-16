import { Response } from 'express';
import { z } from 'zod';
import { supabase } from '../config/supabase';
import { ApiError } from '../utils/ApiError';
import { asyncHandler } from '../utils/asyncHandler';
import { toChatMessageDTO } from '../utils/mappers';
import { AuthedRequest } from '../middleware/auth';

// In-app support chat (components/ui/ChatGPT.tsx on the visitor side,
// AdminChatGPT.tsx on the admin side).
//
// A conversation belongs to a registered user (user_id) when the caller sends a
// bearer token, or to a guest identified by the email they typed into the
// contact form. The frontend stores that email as "chat_draft_email" and passes
// it as `?email=` when reading and as `body.email` when writing.
//
// `role` is the frontend's vocabulary, not a model's: 'user' = written by the
// visitor, 'assistant' = the admin's reply.

const MAX_LIMIT = 200;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseLimit(raw: unknown): number {
  const limit = Number(raw);
  if (!Number.isFinite(limit) || limit <= 0) return 50;
  return Math.min(Math.floor(limit), MAX_LIMIT);
}

/**
 * Resolves whose conversation the request is about: the authenticated user, or
 * else the guest email supplied by the caller.
 */
function resolveOwner(req: AuthedRequest, emailFromRequest?: unknown) {
  if (req.user) return { userId: req.user.id as string | null, guestEmail: null as string | null };

  const email = typeof emailFromRequest === 'string' ? emailFromRequest.trim().toLowerCase() : '';
  if (!email) {
    throw ApiError.unauthorized('Log in or submit the contact form before using chat');
  }
  return { userId: null as string | null, guestEmail: email };
}

function scopeToOwner(query: any, owner: { userId: string | null; guestEmail: string | null }) {
  return owner.userId ? query.eq('user_id', owner.userId) : query.eq('guest_email', owner.guestEmail);
}

async function insertMessage(row: Record<string, any>) {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert(row)
    .select('*, users(email, full_name)')
    .single();
  if (error || !data) throw new ApiError(500, error?.message || 'Failed to save chat message');
  return data;
}

// ---------------------------------------------------------------------------
// Visitor side
// ---------------------------------------------------------------------------

const sendSchema = z.object({
  message: z.string().trim().min(1, 'Message is required'),
  email: z.string().email().optional(),
  // The widget replays the visible transcript with every send. It is not
  // persisted (the transcript already lives in this table) but accepting it
  // keeps the request valid.
  conversationHistory: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string() }))
    .optional(),
});

export const sendChatMessage = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = sendSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const owner = resolveOwner(req, parsed.data.email);

  // Carry the guest's name/number forward from their contact-form submission so
  // the admin inbox keeps showing who they are on follow-up messages.
  let guestName: string | null = null;
  let guestContactNumber: string | null = null;
  if (owner.guestEmail) {
    const { data: previous } = await supabase
      .from('chat_messages')
      .select('guest_name, guest_contact_number')
      .eq('guest_email', owner.guestEmail)
      .not('guest_name', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    guestName = previous?.guest_name ?? null;
    guestContactNumber = previous?.guest_contact_number ?? null;
  }

  const created = await insertMessage({
    user_id: owner.userId,
    guest_email: owner.guestEmail,
    guest_name: guestName,
    guest_contact_number: guestContactNumber,
    role: 'user',
    content: parsed.data.message,
  });

  res.status(201).json({ message: 'Message sent', chatMessage: toChatMessageDTO(created) });
});

export const getMyChatMessages = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const owner = resolveOwner(req, req.query.email);
  const limit = parseLimit(req.query.limit);

  // Take the newest `limit` rows, then hand them back oldest-first: the visitor
  // widget renders the array straight into the transcript without sorting.
  const { data, error } = await scopeToOwner(
    supabase.from('chat_messages').select('*, users(email, full_name)'),
    owner
  )
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new ApiError(500, error.message);
  res.json({ messages: (data || []).reverse().map(toChatMessageDTO) });
});

const contactSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  email: z.string().trim().email('A valid email is required'),
  contactNumber: z.string().trim().min(1, 'Contact number is required'),
  message: z.string().trim().min(1, 'Message is required'),
});

export const submitChatContact = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = contactSchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const email = parsed.data.email.toLowerCase();

  // A logged-in user's conversation stays keyed by their id; the email is still
  // recorded so the admin inbox can show the address they typed.
  const created = await insertMessage({
    user_id: req.user?.id ?? null,
    guest_email: email,
    guest_name: parsed.data.name,
    guest_contact_number: parsed.data.contactNumber,
    role: 'user',
    content: parsed.data.message,
  });

  res.status(201).json({ message: 'Contact form submitted', chatMessage: toChatMessageDTO(created) });
});

// ---------------------------------------------------------------------------
// Admin side
// ---------------------------------------------------------------------------

const ADMIN_FETCH_CAP = 1000;

export const adminListChatUsers = asyncHandler(async (_req: AuthedRequest, res: Response) => {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*, users(id, email, full_name)')
    .order('created_at', { ascending: false })
    .limit(ADMIN_FETCH_CAP);
  if (error) throw new ApiError(500, error.message);

  // Collapse the message log into one row per conversation, newest first. Rows
  // arrive newest-first, so the first one seen for a key is the latest.
  const conversations = new Map<string, any>();
  for (const row of data || []) {
    const key = row.user_id || row.guest_email;
    if (!key) continue;

    const existing = conversations.get(key);
    if (!existing) {
      conversations.set(key, {
        userId: key,
        userEmail: row.users?.email ?? row.guest_email ?? '',
        userName: row.users?.full_name ?? row.guest_name ?? 'Guest',
        lastMessage: row.content,
        lastMessageTime: row.created_at,
        messageCount: row.role === 'user' ? 1 : 0,
        user: row.users
          ? { id: row.users.id, email: row.users.email, fullName: row.users.full_name }
          : null,
      });
      continue;
    }

    if (row.role === 'user') existing.messageCount += 1;
    // Older rows can still carry identity fields the newest one lacked (e.g. a
    // guest who gave their name in the contact form and sent bare messages
    // afterwards).
    if (!existing.userName || existing.userName === 'Guest') {
      existing.userName = row.users?.full_name ?? row.guest_name ?? existing.userName;
    }
    if (!existing.userEmail) existing.userEmail = row.users?.email ?? row.guest_email ?? '';
  }

  res.json({ users: Array.from(conversations.values()) });
});

export const adminGetChatMessages = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const key = req.params.userId;
  if (!key) throw ApiError.badRequest('userId is required');
  const limit = parseLimit(req.query.limit);

  // `userId` is whatever adminListChatUsers keyed the conversation by: a real
  // user id for a registered user, or the email for a guest.
  const isUuid = UUID_RE.test(key);
  const query = supabase.from('chat_messages').select('*, users(email, full_name)');

  const { data, error } = await (isUuid ? query.eq('user_id', key) : query.eq('guest_email', key))
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new ApiError(500, error.message);

  // Newest-first on purpose: the admin widget calls .reverse() on this array.
  res.json({ messages: (data || []).map(toChatMessageDTO) });
});

const adminReplySchema = z.object({
  userId: z.string().trim().min(1, 'userId is required'),
  message: z.string().trim().min(1, 'Message is required'),
});

export const adminSendChatResponse = asyncHandler(async (req: AuthedRequest, res: Response) => {
  const parsed = adminReplySchema.safeParse(req.body);
  if (!parsed.success) throw ApiError.badRequest(parsed.error.errors[0]?.message || 'Invalid input');

  const key = parsed.data.userId;
  const isUuid = UUID_RE.test(key);

  if (isUuid) {
    const { data: user } = await supabase.from('users').select('id').eq('id', key).maybeSingle();
    if (!user) throw ApiError.notFound('User not found');
  }

  const created = await insertMessage({
    user_id: isUuid ? key : null,
    guest_email: isUuid ? null : key.toLowerCase(),
    role: 'assistant',
    content: parsed.data.message,
  });

  // Everything in this conversation has now been seen by an admin.
  await supabase
    .from('chat_messages')
    .update({ read_by_admin: true })
    .eq(isUuid ? 'user_id' : 'guest_email', isUuid ? key : key.toLowerCase());

  res.status(201).json({ message: 'Response sent', chatMessage: toChatMessageDTO(created) });
});
