import { MemoryCacheStore } from './memoryStore';
import { RedisCacheStore } from './redisStore';

export interface ICacheStore {
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>;
  del(key: string): Promise<void>;
  delPattern?(pattern: string): Promise<void>;
  clear(): Promise<void>;
}

let activeStore: ICacheStore | null = null;

export function getCacheStore(): ICacheStore {
  if (activeStore) return activeStore;

  const driver = process.env.CACHE_DRIVER ?? 'memory';
  if (driver === 'redis') {
    activeStore = new RedisCacheStore(process.env.REDIS_URL);
  } else {
    activeStore = new MemoryCacheStore();
  }
  return activeStore;
}

export function setCustomCacheStore(store: ICacheStore): void {
  activeStore = store;
}

export async function cached<T>(
  key: string,
  ttlSeconds: number,
  fetcher: () => Promise<T>
): Promise<T> {
  const store = getCacheStore();
  const hit = await store.get<T>(key);
  if (hit !== null && hit !== undefined) {
    return hit;
  }
  const fresh = await fetcher();
  await store.set(key, fresh, ttlSeconds);
  return fresh;
}
