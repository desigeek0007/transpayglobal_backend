import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { env } from './config/env';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';
import { multerErrorHandler } from './middleware/upload';

import statusRoutes from './routes/status.routes';
import uploadsRoutes from './routes/uploads.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import kycRoutes from './routes/kyc.routes';
import portalRoutes from './routes/portal.routes';
import adminRoutes from './routes/admin.routes';
import loanRoutes from './routes/loans.routes';
import jobRoutes from './routes/jobs.routes';
import legalRoutes from './routes/legal.routes';
import healthServicesRoutes from './routes/healthServices.routes';
import travelRoutes from './routes/travel.routes';
import scholarshipRoutes from './routes/scholarships.routes';
import copyTradingRoutes from './routes/copyTrading.routes';
import paymentRoutes from './routes/payments.routes';
import voucherRoutes from './routes/vouchers.routes';
import notificationRoutes from './routes/notifications.routes';
import charityRoutes from './routes/charity.routes';
import cryptoRoutes from './routes/crypto.routes';
import entertainmentRoutes from './routes/entertainment.routes';
import chatRoutes from './routes/chat.routes';
import miscRoutes from './routes/misc.routes';

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.corsOrigin, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
if (env.nodeEnv !== 'test') {
  app.use(morgan(env.nodeEnv === 'production' ? 'combined' : 'dev'));
}

// Infra health check (load balancer / uptime probe) — NOT the "Health Services"
// (doctors/patients) product domain, which lives under /api/health below.
app.use('/health', statusRoutes);

// Resolves the `${API_BASE_URL}/uploads/<stored value>` links both frontends
// build for document previews and downloads. See uploads.routes.ts.
app.use('/uploads', uploadsRoutes);

// Every domain router below declares its own full path (including the leading
// segment, e.g. `/auth/register`, `/admin/loans`) and is mounted at /api, since
// the real contract mixes /api/<domain>/... and /api/admin/<domain>/... under
// the same router rather than a clean per-domain prefix.
app.use('/api', authRoutes);
app.use('/api', userRoutes);
app.use('/api', kycRoutes);
app.use('/api', portalRoutes);
app.use('/api', adminRoutes);
app.use('/api', loanRoutes);
app.use('/api', jobRoutes);
app.use('/api', legalRoutes);
app.use('/api', healthServicesRoutes);
app.use('/api', travelRoutes);
app.use('/api', scholarshipRoutes);
app.use('/api', copyTradingRoutes);
app.use('/api', paymentRoutes);
app.use('/api', voucherRoutes);
app.use('/api', notificationRoutes);
app.use('/api', charityRoutes);
app.use('/api', cryptoRoutes);
app.use('/api', entertainmentRoutes);
app.use('/api', chatRoutes);
app.use('/api', miscRoutes);

app.use(multerErrorHandler);
app.use(notFoundHandler);
app.use(errorHandler);
