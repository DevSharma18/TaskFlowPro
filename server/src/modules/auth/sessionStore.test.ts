import { SessionStore } from './sessionStore';
import * as mongoModule from '../../db/mongo';

describe('SessionStore', () => {
  let store: SessionStore;
  let mockDocs: mongoModule.SessionDoc[];

  beforeEach(() => {
    mockDocs = [];
    store = new SessionStore();

    const mockCollection = {
      insertOne: jest.fn(async (doc: mongoModule.SessionDoc) => {
        mockDocs.push(doc);
        return { insertedId: 'mock-id' };
      }),
      find: jest.fn((query: { tokenPrefix?: string; expiresAt?: { $gt: Date }; sessionId?: string }) => {
        const filtered = mockDocs.filter((d) => {
          if (query.sessionId && d.sessionId !== query.sessionId) return false;
          if (query.tokenPrefix && d.tokenPrefix !== query.tokenPrefix) return false;
          if (query.expiresAt?.$gt && d.expiresAt <= query.expiresAt.$gt) return false;
          return true;
        });
        return {
          toArray: async () => filtered,
        };
      }),
      findOne: jest.fn(async (query: { sessionId?: string }) => {
        return mockDocs.find((d) => !query.sessionId || d.sessionId === query.sessionId) ?? null;
      }),
      updateOne: jest.fn(async (filter: { sessionId: string }, update: { $set: Partial<mongoModule.SessionDoc> }) => {
        const doc = mockDocs.find((d) => d.sessionId === filter.sessionId);
        if (doc && update.$set) {
          Object.assign(doc, update.$set);
          return { matchedCount: 1, modifiedCount: 1 };
        }
        return { matchedCount: 0, modifiedCount: 0 };
      }),
      deleteOne: jest.fn(async (query: { sessionId: string }) => {
        const initial = mockDocs.length;
        mockDocs = mockDocs.filter((d) => d.sessionId !== query.sessionId);
        return { deletedCount: initial - mockDocs.length };
      }),
      deleteMany: jest.fn(async (query: { userId: string }) => {
        const initial = mockDocs.length;
        mockDocs = mockDocs.filter((d) => d.userId !== query.userId);
        return { deletedCount: initial - mockDocs.length };
      }),
    };

    jest.spyOn(mongoModule, 'getSessionsCollection').mockReturnValue(mockCollection as never);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('creates session document in MongoDB collection', async () => {
    const session = await store.createSession({
      userId: 'user-123',
      tokenHash: 'bcrypt-hashed-token',
      tokenPrefix: '1234567890abcdef',
      expiresAt: new Date(Date.now() + 86400_000),
      ipAddress: '127.0.0.1',
      userAgent: 'Mozilla/5.0',
    });

    expect(session.sessionId).toBeDefined();
    expect(session.userId).toBe('user-123');
    expect(session.tokenPrefix).toBe('1234567890abcdef');
    expect(mockDocs.length).toBe(1);
  });

  it('finds active sessions by prefix', async () => {
    await store.createSession({
      userId: 'user-1',
      tokenHash: 'hash-1',
      tokenPrefix: 'prefix-match',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    await store.createSession({
      userId: 'user-2',
      tokenHash: 'hash-2',
      tokenPrefix: 'prefix-other',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const results = await store.findSessionsByPrefix('prefix-match');
    expect(results.length).toBe(1);
    expect(results[0].userId).toBe('user-1');
  });

  it('rotates session with grace period for old session', async () => {
    const original = await store.createSession({
      userId: 'user-rot',
      tokenHash: 'old-hash',
      tokenPrefix: 'old-prefix',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const rotated = await store.rotateSession(original.sessionId, {
      userId: 'user-rot',
      tokenHash: 'new-hash',
      tokenPrefix: 'new-prefix',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    expect(rotated.sessionId).not.toBe(original.sessionId);
    expect(rotated.tokenPrefix).toBe('new-prefix');
    // Both sessions exist during the 30s grace window
    expect(mockDocs.length).toBe(2);
    const oldDoc = mockDocs.find((d) => d.sessionId === original.sessionId);
    expect(oldDoc?.replacedBy).toBe(rotated.sessionId);
    expect(oldDoc?.rotatedAt).toBeDefined();
  });

  it('deletes session on logout', async () => {
    const session = await store.createSession({
      userId: 'user-del',
      tokenHash: 'hash-del',
      tokenPrefix: 'prefix-del',
      expiresAt: new Date(Date.now() + 86400_000),
    });

    const deleted = await store.deleteSession(session.sessionId);
    expect(deleted).toBe(true);
    expect(mockDocs.length).toBe(0);
  });
});
