import http from 'http';
import { createApp } from './app';
import { env } from './config/env';
import { logger } from './lib/logger';
import { db } from './db';
import { connectMongo, disconnectMongo } from './db/mongo';
import { initSocket } from './realtime/socket';
import { dagEngine } from './modules/dag/dagEngine';

async function main() {
  // Fail fast if PostgreSQL unreachable
  await db.raw('SELECT 1');
  logger.info('database connected');

  // Connect MongoDB for user sessions (fail-fast to prevent zombie state)
  await connectMongo();
  logger.info('mongodb connected');

  await dagEngine.hydrate(db);
  logger.info('dag engine hydrated');

  const app = createApp();
  const server = http.createServer(app);
  initSocket(server);

  server.listen(env.port, () => {
    logger.info(`TaskFlow Pro server listening on :${env.port} (${env.nodeEnv})`);
  });

  const shutdown = async (signal: string) => {
    logger.info(`${signal} received, shutting down gracefully`);
    server.close(async () => {
      try {
        await disconnectMongo();
        await db.destroy();
      } finally {
        process.exit(0);
      }
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('unhandledRejection', (reason) => {
    logger.error('unhandled_rejection', { reason });
  });
  process.on('uncaughtException', (err) => {
    logger.error('uncaught_exception', { err });
    process.exit(1);
  });
}

main().catch((err) => {
  logger.error('fatal startup error', { err });
  process.exit(1);
});
