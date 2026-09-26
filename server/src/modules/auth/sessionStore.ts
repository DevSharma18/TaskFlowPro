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

  async getSession(sessionId: string): Promise<SessionDoc | null> {
    const col = getSessionsCollection();
    if (col.findOne) {
      return col.findOne({ sessionId });
    }
    const docs = await col.find({ sessionId }).toArray();
    return docs[0] ?? null;
  }

  /**
   * RFC 6819 rotation with 30s grace period.
   * Mark old session with replacedBy & rotatedAt and expire after 30s.
   * Allows concurrent in-flight requests to succeed without session destruction.
   */
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
    const newSession = await this.createSession(newData);
    const graceExpiresAt = new Date(Date.now() + 30_000);

    await col.updateOne(
      { sessionId: oldSessionId },
      {
        $set: {
          replacedBy: newSession.sessionId,
          rotatedAt: new Date(),
          expiresAt: graceExpiresAt,
        },
      }
    );

    return newSession;
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
