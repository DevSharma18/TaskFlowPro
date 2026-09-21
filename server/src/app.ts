import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { requestContext } from './middlewares/requestContext';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { authRouter } from './modules/auth/authRoutes';
import { teamRouter } from './modules/teams/teamRoutes';
import { taskRouter } from './modules/tasks/taskRoutes';
import { dependencyRouter } from './modules/dependencies/dependencyRoutes';
import { dagRouter } from './modules/dag/dagRoutes';
import { aiRouter } from './modules/ai/aiRoutes';

export function createApp(): express.Express {
  const app = express();

  app.set('trust proxy', 1);
  app.use(helmet({ contentSecurityPolicy: env.isProd ? undefined : false }));
  app.use(
    cors({
      origin: env.clientOrigin.split(','),
      credentials: true,
    })
  );
  app.use(compression());
  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());
  app.use(requestContext);
  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: 100,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
    })
  );

  app.get('/api/health', (_req, res) => {
    res.json({ success: true, status: 'ok', uptime: process.uptime() });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/teams', teamRouter);
  app.use('/api/tasks', taskRouter);
  app.use('/api/dependencies', dependencyRouter);
  app.use('/api/dag', dagRouter);
  app.use('/api/ai', aiRouter);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
