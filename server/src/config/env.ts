import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  nodeEnv: process.env.NODE_ENV ?? 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: parseInt(process.env.PORT ?? '4000', 10),
  logLevel: process.env.LOG_LEVEL ?? 'debug',
  databaseUrl: required('DATABASE_URL', 'postgres://taskflow:taskflow@localhost:5432/taskflow_pro'),
  jwtSecret: required('JWT_SECRET', 'dev-only-insecure-secret-32chars!!'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-only-insecure-refresh-32chars!'),
  clientOrigin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173',
  geminiApiKey: process.env.GEMINI_API_KEY ?? '',
  geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.5-flash',
  mongodbUri: process.env.MONGODB_URI ?? 'mongodb://localhost:27017/taskflow_pro',
  cacheDriver: process.env.CACHE_DRIVER ?? 'memory',
  rateLimitStore: process.env.RATE_LIMIT_STORE ?? 'memory',
  redisUrl: process.env.REDIS_URL,
  jwtAccessTtl: '15m',
  jwtRefreshTtlDays: 7,
  bcryptRounds: 12,
};
