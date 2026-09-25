import { MemoryCacheStore } from './memoryStore';
import { cached, getCacheStore, setCustomCacheStore } from './index';

describe('MemoryCacheStore', () => {
  let store: MemoryCacheStore;

  beforeEach(() => {
    store = new MemoryCacheStore();
  });

  it('stores and retrieves values', async () => {
    await store.set('foo', { a: 1 });
    const res = await store.get<{ a: number }>('foo');
    expect(res).toEqual({ a: 1 });
  });

  it('returns null for nonexistent keys', async () => {
    const res = await store.get('missing');
    expect(res).toBeNull();
  });

  it('deletes keys', async () => {
    await store.set('key', 'val');
    await store.del('key');
    expect(await store.get('key')).toBeNull();
  });

  it('clears all keys', async () => {
    await store.set('k1', 'v1');
    await store.set('k2', 'v2');
    await store.clear();
    expect(store.size()).toBe(0);
    expect(await store.get('k1')).toBeNull();
  });

  it('handles TTL expiration', async () => {
    // 1 second TTL
    await store.set('temp', 'temp-value', 1);
    expect(await store.get('temp')).toBe('temp-value');

    // Manually simulate time pass by reaching into store or waiting
    const item = (store as unknown as { store: Map<string, { expiresAt: number }> }).store.get('temp');
    if (item) item.expiresAt = Date.now() - 1000;

    expect(await store.get('temp')).toBeNull();
  });

  it('deletes keys matching a wildcard pattern', async () => {
    await store.set('dag:graph:team-1', 'graph1');
    await store.set('dag:cp:team-1', 'cp1');
    await store.set('dag:graph:team-2', 'graph2');

    await store.delPattern('dag:*:team-1');

    expect(await store.get('dag:graph:team-1')).toBeNull();
    expect(await store.get('dag:cp:team-1')).toBeNull();
    expect(await store.get('dag:graph:team-2')).toBe('graph2');
  });
});

describe('cached() helper', () => {
  it('calls fetcher on cache miss and returns cached value on hit', async () => {
    const store = new MemoryCacheStore();
    setCustomCacheStore(store);

    let calls = 0;
    const fetcher = async () => {
      calls++;
      return { answer: 42 };
    };

    const first = await cached('test-key', 60, fetcher);
    const second = await cached('test-key', 60, fetcher);

    expect(first).toEqual({ answer: 42 });
    expect(second).toEqual({ answer: 42 });
    expect(calls).toBe(1);
  });
});
