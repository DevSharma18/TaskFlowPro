import { ICacheStore } from './index';

export class RedisCacheStore implements ICacheStore {
  private client: unknown = null;

  constructor(private redisUrl?: string) {
    if (!redisUrl) {
      throw new Error('REDIS_URL required for RedisCacheStore');
    }
  }

  async get<T>(_key: string): Promise<T | null> {
    throw new Error('Redis client adapter not installed. Install ioredis to use RedisCacheStore.');
  }

  async set<T>(_key: string, _value: T, _ttlSeconds = 0): Promise<void> {
    throw new Error('Redis client adapter not installed. Install ioredis to use RedisCacheStore.');
  }

  async del(_key: string): Promise<void> {
    throw new Error('Redis client adapter not installed. Install ioredis to use RedisCacheStore.');
  }

  async delPattern?(_pattern: string): Promise<void> {
    throw new Error('Redis client adapter not installed. Install ioredis to use RedisCacheStore.');
  }

  async clear(): Promise<void> {
    throw new Error('Redis client adapter not installed. Install ioredis to use RedisCacheStore.');
  }
}
