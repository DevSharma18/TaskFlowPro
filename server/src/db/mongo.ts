import { logger } from '../lib/logger';
import { env } from '../config/env';

export interface CollectionLike<T = unknown> {
  insertOne(doc: T): Promise<{ insertedId?: unknown }>;
  find(query: Record<string, unknown>): { toArray(): Promise<T[]> };
  findOne?(query: Record<string, unknown>): Promise<T | null>;
  updateOne(filter: Record<string, unknown>, update: Record<string, unknown>): Promise<{ matchedCount?: number; modifiedCount?: number }>;
  deleteOne(query: Record<string, unknown>): Promise<{ deletedCount?: number }>;
  deleteMany(query: Record<string, unknown>): Promise<{ deletedCount?: number }>;
  createIndex(spec: Record<string, unknown>, options?: Record<string, unknown>): Promise<string>;
}

export interface DbLike {
  collection<T = unknown>(name: string): CollectionLike<T>;
}

export interface MongoClientLike {
  connect(): Promise<void>;
  db(name?: string): DbLike;
  close(): Promise<void>;
}

let client: MongoClientLike | null = null;
let dbInstance: DbLike | null = null;

export interface SessionDoc {
  sessionId: string;
  userId: string;
  tokenHash: string;
  tokenPrefix: string;
  ipAddress?: string;
  userAgent?: string;
  createdAt: Date;
  expiresAt: Date;
  replacedBy?: string;
  rotatedAt?: Date;
}

export async function connectMongo(customUri?: string): Promise<DbLike> {
  if (dbInstance && client) return dbInstance;

  let MongoClientClass: new (uri: string, options?: Record<string, unknown>) => MongoClientLike;
  try {
    // Dynamic import/require so server boots gracefully even if driver is optional
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const mongodb = require('mongodb');
    MongoClientClass = mongodb.MongoClient;
  } catch {
    throw new Error('mongodb driver not installed. Please run npm install mongodb.');
  }

  const uri = customUri ?? env.mongodbUri;
  client = new MongoClientClass(uri, {
    maxPoolSize: 20,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  await client.connect();
  dbInstance = client.db();
  logger.info('mongodb connected');

  // Setup TTL and prefix indexes
  const sessions = dbInstance.collection<SessionDoc>('sessions');
  await sessions.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
  await sessions.createIndex({ tokenPrefix: 1 });
  await sessions.createIndex({ userId: 1 });

  return dbInstance;
}

export function getMongoDb(): DbLike {
  if (!dbInstance) {
    throw new Error('MongoDB not initialized. Call connectMongo first.');
  }
  return dbInstance;
}

export function getSessionsCollection(): CollectionLike<SessionDoc> {
  return getMongoDb().collection<SessionDoc>('sessions');
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
    client = null;
    dbInstance = null;
    logger.info('mongodb disconnected');
  }
}

export function isMongoConnected(): boolean {
  return client !== null && dbInstance !== null;
}
