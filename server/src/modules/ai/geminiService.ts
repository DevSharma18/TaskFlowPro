import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import crypto from 'crypto';
import { env } from '../../config/env';
import { logger } from '../../lib/logger';
import { AppError } from '../../lib/errors';
import { getCacheStore } from '../../lib/cache';

export class AiUnavailableError extends AppError {
  constructor(message = 'AI service is temporarily unavailable') {
    super(503, 'AI_UNAVAILABLE', message);
  }
}

const CACHE_TTL_SECONDS = 5 * 60; // 5 minutes
const TIMEOUT_MS = 10_000;
const MAX_RETRIES = 3;

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

export function cleanJsonText(raw: string): string {
  const trimmed = raw.trim();

  // Pattern 1: Extract content from markdown code block (handles preambles and footers)
  const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (codeBlockMatch && codeBlockMatch[1]) {
    return codeBlockMatch[1].trim();
  }

  // Pattern 2: Slice from first JSON opening delimiter ({ or [) to last closing delimiter (} or ])
  const firstBrace = trimmed.indexOf('{');
  const firstBracket = trimmed.indexOf('[');
  let start = -1;

  if (firstBrace !== -1 && firstBracket !== -1) {
    start = Math.min(firstBrace, firstBracket);
  } else {
    start = Math.max(firstBrace, firstBracket);
  }

  if (start !== -1) {
    const lastBrace = trimmed.lastIndexOf('}');
    const lastBracket = trimmed.lastIndexOf(']');
    const end = Math.max(lastBrace, lastBracket);
    if (end > start) {
      return trimmed.slice(start, end + 1);
    }
  }

  return trimmed;
}

/**
 * Call Gemini with a grounded prompt and parse JSON output.
 * Retries with exponential backoff, caches by prompt hash for 5 minutes.
 */
export async function callGemini<T>(templateKey: string, prompt: string): Promise<T> {
  const cache = getCacheStore();
  const key = `ai:${crypto.createHash('sha256').update(templateKey + prompt).digest('hex')}`;
  const hit = await cache.get<T>(key);
  if (hit !== null && hit !== undefined) return hit;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const model = getModel();
      const result = await withTimeout(model.generateContent(prompt), TIMEOUT_MS);
      const text = result.response.text();
      const cleaned = cleanJsonText(text);
      const parsed = JSON.parse(cleaned) as T;
      await cache.set(key, parsed, CACHE_TTL_SECONDS);
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
