import path from 'path';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import compression from 'compression';
import { createRateLimiter } from './middlewares/rateLimiter';
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
    createRateLimiter({
      windowMs: 60_000,
      limit: 100,
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

  // Serve client static files in production when available
  const clientDist = path.resolve(__dirname, '../../client/dist');
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
      return next();
    }
    res.sendFile(path.join(clientDist, 'index.html'), (err) => {
      if (err) next();
    });
  });

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
