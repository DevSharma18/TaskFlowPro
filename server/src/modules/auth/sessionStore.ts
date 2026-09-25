import { randomUUID } from 'crypto';
import { getSessionsCollection, SessionDoc } from '../../db/mongo';

export class SessionStore {
  async createSession(data: {
    userId: string;
    tokenHash: string;
    tokenPrefix: string;
    expiresAt: Date;
    ipAddress?: string;
    userAgent?: string;
  }): Promise<SessionDoc> {
    const col = getSessionsCollection();
    const doc: SessionDoc = {
      sessionId: randomUUID(),
      userId: data.userId,
      tokenHash: data.tokenHash,
      tokenPrefix: data.tokenPrefix,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      createdAt: new Date(),
      expiresAt: data.expiresAt,
    };
    await col.insertOne(doc);
    return doc;
  }

  async findSessionsByPrefix(tokenPrefix: string): Promise<SessionDoc[]> {
    const col = getSessionsCollection();
    return col
      .find({
        tokenPrefix,
        expiresAt: { $gt: new Date() },
      })
      .toArray();
  }

  async rotateSession(
    oldSessionId: string,
    newData: {
      userId: string;
      tokenHash: string;
      tokenPrefix: string;
      expiresAt: Date;
      ipAddress?: string;
      userAgent?: string;
    }
  ): Promise<SessionDoc> {
    const col = getSessionsCollection();
    await col.deleteOne({ sessionId: oldSessionId });
    return this.createSession(newData);
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    const col = getSessionsCollection();
    const res = await col.deleteOne({ sessionId });
    return (res.deletedCount ?? 0) > 0;
  }

  async deleteSessionsForUser(userId: string): Promise<number> {
    const col = getSessionsCollection();
    const res = await col.deleteMany({ userId });
    return res.deletedCount ?? 0;
  }
}

export const sessionStore = new SessionStore();
