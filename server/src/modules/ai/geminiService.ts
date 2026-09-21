import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../lib/errors';

export class AiUnavailableError extends AppError {
  constructor(message = 'AI service is temporarily unavailable') {
    super(503, 'AI_UNAVAILABLE', message);
  }
}

interface CacheEntry {
  value: unknown;
  expiresAt: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000;
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;
const cache = new Map<string, CacheEntry>();

function getModel(): GenerativeModel {
  if (!env.geminiApiKey) throw new AiUnavailableError('AI is not configured on this server');
  const genAI = new GoogleGenerativeAI(env.geminiApiKey);
  return genAI.getGenerativeModel({
    model: env.geminiModel,
    generationConfig: {
      temperature: 0.2,
      responseMimeType: 'application/json',
    },
  });
}

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new AiUnavailableError('AI request timed out')), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer!);
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Call Gemini with a grounded prompt and parse JSON output.
 * Retries with exponential backoff, caches by prompt hash for 5 minutes.
 */
export async function callGemini<T>(templateKey: string, prompt: string): Promise<T> {
  const key = crypto.createHash('sha256').update(templateKey + prompt).digest('hex');
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value as T;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const model = getModel();
      const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
      const text = result.response.text();
      const parsed = JSON.parse(text) as T;
      cache.set(key, { value: parsed, expiresAt: Date.now() + CACHE_TTL_MS });
      return parsed;
    } catch (err) {
      lastErr = err;
      if (err instanceof AiUnavailableError && !env.geminiApiKey) throw err; // not configured — don't retry
      logger.warn('gemini call failed', { templateKey, attempt, message: (err as Error).message });
      await sleep(500 * 2 ** attempt);
    }
  }
  logger.error('gemini call exhausted retries', { templateKey });
  throw new AiUnavailableError(`AI request failed: ${(lastErr as Error)?.message ?? 'unknown error'}`);
}
